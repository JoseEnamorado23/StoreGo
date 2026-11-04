"""Cliente real de Factus Facturación (factura, nota crédito y nota débito).

Hechos verificados en AGENTS.md y en docs/payloads/. Resumen de lo que hace este módulo:
- Token en memoria, renovado con el refresh_token antes de vencer o ante un 401 (una sola vez, con lock).
- Elige el rango de numeración activo y vigente de cada documento (cacheado) o el forzado por .env.
- Convierte los esquemas de schemas/factus.py a los payloads de la API v2 y la respuesta a DocumentoOut.
- Errores: la DIAN rechaza -> RechazoDIAN; demora de la DIAN -> DocumentoOut con is_validated=False;
  409 -> se borra el pendiente por su reference_code y se reenvía una sola vez.
Nunca se registran tokens, contraseñas ni cuerpos de autenticación.
"""

import asyncio
import logging
import time
import unicodedata
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal
from urllib.parse import quote

import httpx
from fastapi import HTTPException

from app.config import settings
from app.schemas.factus import (
    ClienteFactura,
    DocumentoOut,
    ItemFactura,
    PagoFactura,
)
from app.services._http import cliente as _crear_cliente

log = logging.getLogger(__name__)

TipoDocumento = Literal["factura", "nota_credito", "nota_debito"]

_http = _crear_cliente(settings.factus_base_url)  # timeout de 30 s: la DIAN puede tardar en validar


# ---- Excepciones propias --------------------------------------------------------------------

_NOMBRE_DOCUMENTO = {"factura": "factura", "nota_credito": "nota crédito", "nota_debito": "nota débito"}


class RechazoDIAN(HTTPException):
    """La DIAN rechazó el documento (los errores traen la palabra «Rechazo»): hay que corregir los datos."""

    def __init__(self, tipo: str, referencia: str, errores):
        self.referencia = referencia
        self.errores = errores
        super().__init__(
            status_code=422,
            detail=f"La DIAN rechazó la {_NOMBRE_DOCUMENTO.get(tipo, tipo)} {referencia}: {_resumen_errores(errores)}",
        )


class ConflictoPendiente(HTTPException):
    """Factus responde 409 y el documento pendiente no es de esta aplicación (o no se pudo borrar)."""

    def __init__(self, referencia: str):
        self.referencia = referencia
        super().__init__(
            status_code=409,
            detail=(
                f"Factus tiene un documento pendiente ante la DIAN que bloquea {referencia} y no se pudo resolver "
                "borrándolo por su código. Puede ser de otro equipo que usa las mismas credenciales del sandbox: "
                "avisa al equipo y reintenta en unos minutos."
            ),
        )


def _resumen_errores(errores, maximo: int = 3) -> str:
    if isinstance(errores, dict):
        partes = [f"{k}: {v}" for k, v in errores.items()]
    elif isinstance(errores, list):
        partes = [str(x) for x in errores]
    else:
        return "sin detalle"
    return "; ".join(partes[:maximo]) + ("..." if len(partes) > maximo else "")


# ---- Token --------------------------------------------------------------------------------------

_candado = asyncio.Lock()
_access_token: str | None = None
_refresh_token: str | None = None
_vence_en: float = 0.0  # time.monotonic() desde el cual hay que renovar


def _guardar_token(datos: dict) -> None:
    global _access_token, _refresh_token, _vence_en
    _access_token = datos["access_token"]
    _refresh_token = datos.get("refresh_token") or _refresh_token
    vigencia = int(datos.get("expires_in", 600))  # la doc dice 1 h y algún ejemplo 600 s: se respeta lo recibido
    _vence_en = time.monotonic() + vigencia - min(60, vigencia // 2)  # renueva antes de que venza


async def _solicitar_token(form: dict) -> bool:
    try:
        r = await _http.post("/oauth/token", data=form)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="No se pudo conectar con Factus Facturación para autenticarse")
    if r.status_code != 200:
        log.warning("Factus /oauth/token (%s) respondió %s", form["grant_type"], r.status_code)
        return False
    _guardar_token(r.json())
    return True


async def _renovar_token() -> None:
    """Con el refresh_token; si falla (vencido o revocado), con usuario y contraseña."""
    credenciales = {"client_id": settings.factus_client_id, "client_secret": settings.factus_client_secret}
    if _refresh_token and await _solicitar_token({"grant_type": "refresh_token", "refresh_token": _refresh_token, **credenciales}):
        return
    ok = await _solicitar_token(
        {"grant_type": "password", "username": settings.factus_username, "password": settings.factus_password, **credenciales}
    )
    if not ok:
        raise HTTPException(status_code=502, detail="No se pudo autenticar en Factus Facturación; revisa las credenciales")


async def _token(rechazado: str | None = None) -> str:
    """Token vigente. `rechazado`: el que Factus acaba de rechazar con 401. Si otra petición ya lo renovó mientras
    esperábamos el lock, se reutiliza el nuevo en vez de renovar otra vez."""
    async with _candado:
        vigente = _access_token is not None and time.monotonic() < _vence_en
        if rechazado is not None and _access_token == rechazado:
            vigente = False
        if not vigente:
            await _renovar_token()
        return _access_token  # type: ignore[return-value]


async def _pedir(metodo: str, ruta: str, **kwargs) -> httpx.Response:
    """Llama a la API con el token; ante un 401 renueva y reintenta una sola vez."""

    async def enviar(token: str) -> httpx.Response:
        try:
            return await _http.request(metodo, ruta, headers={"Authorization": f"Bearer {token}"}, **kwargs)
        except httpx.TimeoutException:
            raise HTTPException(
                status_code=504,
                detail="Factus Facturación tardó demasiado en responder (la validación con la DIAN puede demorar); "
                "reintenta con los mismos datos",
            )
        except httpx.HTTPError:
            raise HTTPException(status_code=502, detail="No se pudo conectar con Factus Facturación")

    token = await _token()
    r = await enviar(token)
    if r.status_code == 401:
        r = await enviar(await _token(rechazado=token))
    return r


# ---- Rangos de numeración -----------------------------------------------------------------------------


async def listar_rangos() -> list[dict]:
    """GET /v2/numbering-ranges?filter[is_active]=1. Devuelve la lista `data.data` tal cual."""
    r = await _pedir("GET", "/v2/numbering-ranges", params={"filter[is_active]": 1})
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="No se pudieron consultar los rangos de numeración de Factus")
    d = r.json().get("data", [])
    return d if isinstance(d, list) else d.get("data", [])


_NOMBRE_RANGO = {"factura": "factura de venta", "nota_credito": "nota credito", "nota_debito": "nota debito"}
_VIGENCIA_CACHE = 600.0  # segundos
_cache_rangos: tuple[float, list[dict]] | None = None


def limpiar_cache_rangos() -> None:
    global _cache_rangos
    _cache_rangos = None


async def _rangos() -> list[dict]:
    global _cache_rangos
    if _cache_rangos is None or time.monotonic() - _cache_rangos[0] > _VIGENCIA_CACHE:
        _cache_rangos = (time.monotonic(), await listar_rangos())
    return _cache_rangos[1]


def _sin_acentos(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto.lower()) if unicodedata.category(c) != "Mn")


def _rango_forzado(tipo: str) -> int | None:
    return {
        "factura": settings.factus_rango_factura,
        "nota_credito": settings.factus_rango_nc,
        "nota_debito": settings.factus_rango_nd,
    }[tipo]


def _rango_usable(r: dict) -> bool:
    """Activo, no vencido y con consecutivos disponibles."""
    if not r.get("is_active", True) or r.get("is_expired", False):
        return False
    limite, actual = r.get("to"), r.get("current")
    return not (limite is not None and actual is not None and actual >= limite)


async def rango_para(tipo: TipoDocumento) -> int:
    """Id del rango de numeración (`numbering_range_id`) para el tipo de documento.

    Si FACTUS_RANGO_FACTURA / FACTUS_RANGO_NC / FACTUS_RANGO_ND está definido se usa ese. Si no, el primer rango
    activo, no vencido y con consecutivos disponibles que lista Factus para ese documento. Las notas siempre
    necesitan el id (la cuenta tiene dos rangos de nota crédito); las facturas lo aceptan siempre también.
    """
    forzado = _rango_forzado(tipo)
    if forzado is not None:
        return forzado
    nombre = _NOMBRE_RANGO[tipo]
    for r in await _rangos():
        if _sin_acentos(str(r.get("document", ""))) == nombre and _rango_usable(r):
            return int(r["id"])
    raise HTTPException(
        status_code=409,
        detail=f"No hay un rango de numeración activo y vigente para {nombre}; define su id en el .env",
    )


# ---- Conversión de esquemas a la API v2 ----------------------------------------------------------------------


def _dos(valor: Decimal) -> str:
    return f"{Decimal(valor).quantize(Decimal('0.01'), ROUND_HALF_UP):.2f}"


def _item(i: ItemFactura) -> dict:
    return {
        "code_reference": i.codigo,
        "name": i.nombre,
        "quantity": _dos(i.cantidad),
        "price": _dos(i.precio),
        "unit_measure_code": "94",
        "standard_code": "999",
        # taxes es obligatorio también con IVA 0 (rate 0.00): verificado en el sandbox
        "taxes": [{"code": "01", "rate": f"{i.iva:.2f}"}],
    }


def _items(items: list[ItemFactura]) -> list[dict]:
    if not items:
        raise HTTPException(status_code=422, detail="El documento necesita al menos un producto")
    return [_item(i) for i in items]


def _pago(p: PagoFactura) -> dict:
    detalle = {
        "payment_form": "2" if p.forma == "credito" else "1",
        "payment_method_code": p.metodo_codigo,
        "amount": _dos(p.monto),
    }
    if p.forma == "credito":
        if p.due_date is None:
            raise HTTPException(status_code=422, detail="Un pago a crédito necesita fecha de vencimiento (due_date)")
        detalle["due_date"] = p.due_date.isoformat()
    return detalle


_CONSUMIDOR_FINAL = {
    "identification_document_code": "13",
    "identification": "22222222222",
    "names": "Consumidor Final",
}


def _cliente(c: ClienteFactura | None) -> dict:
    """None = consumidor final. Empresa -> `company`; persona natural -> `names`. El dígito de
    verificación del NIT lo calcula Factus: se envía solo el número."""
    if c is None:
        return dict(_CONSUMIDOR_FINAL)
    documento = c.documento.strip()
    if c.tipo_documento == "31":
        documento = documento.split("-")[0].replace(".", "").replace(" ", "")
    d = {
        "identification_document_code": c.tipo_documento,
        "identification": documento,
        "legal_organization_code": "1" if c.es_empresa else "2",
    }
    if c.es_empresa:
        d["company"] = c.razon_social or c.nombres
    else:
        d["names"] = c.nombres
    for campo, valor in (("email", c.email), ("phone", c.telefono), ("address", c.direccion)):
        if valor:
            d[campo] = valor
    return d


def _errores_de_validacion(cuerpo: dict) -> str:
    errores = (cuerpo.get("data") or {}).get("errors")
    if isinstance(errores, dict):
        return "; ".join(f"{campo}: {' '.join(msgs) if isinstance(msgs, list) else msgs}" for campo, msgs in errores.items())
    return str(cuerpo.get("message", "datos inválidos"))


# ---- Emisión y manejo de errores --------------------------------------------------------------------------------

_RUTAS = {
    "factura": ("/v2/bills/validate", "/v2/bills/destroy/reference/{}"),
    "nota_credito": ("/v2/credit-notes/validate", "/v2/credit-notes/reference/{}"),
    "nota_debito": ("/v2/debit-notes/validate", "/v2/debit-notes/reference/{}"),
}


async def _borrar(tipo: TipoDocumento, referencia: str) -> httpx.Response:
    """DELETE del documento por su reference_code (solo si no está validado por la DIAN)."""
    return await _pedir("DELETE", _RUTAS[tipo][1].format(quote(referencia, safe="")))


async def _borrar_pendiente(tipo: TipoDocumento, referencia: str) -> None:
    r = await _borrar(tipo, referencia)
    if r.status_code in (200, 204):
        log.info("Factus: borrado el %s pendiente %s", tipo, referencia)
        return
    log.warning("Factus: no se pudo borrar el %s pendiente %s (HTTP %s)", tipo, referencia, r.status_code)
    # 404: el pendiente no tiene nuestro reference_code (es de otro). 409: ya está validado. Otro: fallo de Factus.
    if r.status_code in (404, 409):
        raise ConflictoPendiente(referencia)
    raise HTTPException(status_code=502, detail=f"No se pudo borrar el documento pendiente en Factus (HTTP {r.status_code})")


def _a_documento(tipo: TipoDocumento, referencia: str, r: httpx.Response) -> tuple[DocumentoOut, bool]:
    """Convierte la respuesta en DocumentoOut. Devuelve (documento, rechazado)."""
    try:
        cuerpo = r.json()
    except ValueError:
        raise HTTPException(status_code=502, detail=f"Factus Facturación respondió algo inesperado (HTTP {r.status_code})")
    if r.status_code == 422:
        limpiar_cache_rangos()  # por si el rango elegido ya no sirve
        raise HTTPException(status_code=422, detail=f"Factus no aceptó los datos del documento: {_errores_de_validacion(cuerpo)}")
    if r.status_code not in (200, 201):
        raise HTTPException(
            status_code=502, detail=f"Factus Facturación respondió {r.status_code}: {cuerpo.get('message', 'error desconocido')}"
        )
    data = cuerpo.get("data") or {}
    links = data.get("links") or {}
    errores = data.get("errors") or None  # avisos de la DIAN: dict en facturas, lista en notas
    validado = bool(data.get("is_validated"))
    doc = DocumentoOut(
        tipo=tipo,
        reference_code=data.get("reference_code") or referencia,
        numero=data.get("number"),
        cufe=data.get("cufe"),
        cude=data.get("cude"),  # las notas lo llaman cude; DocumentoOut lo copia a cufe
        is_validated=validado,
        public_url=links.get("public_url"),
        qr_url=links.get("qr"),
        errores=errores,
    )
    rechazado = not validado and "Rechazo" in str(errores)
    return doc, rechazado


async def _emitir(tipo: TipoDocumento, cuerpo: dict) -> DocumentoOut:
    referencia = cuerpo["reference_code"]
    ruta = _RUTAS[tipo][0]
    log.info("Factus: enviando %s %s", tipo, referencia)

    r = await _pedir("POST", ruta, json=cuerpo)
    if r.status_code == 409:
        # Documento pendiente ante la DIAN: se borra por su reference_code y se reenvía una sola vez
        await _borrar_pendiente(tipo, referencia)
        r = await _pedir("POST", ruta, json=cuerpo)
        if r.status_code == 409:
            raise ConflictoPendiente(referencia)

    doc, rechazado = _a_documento(tipo, referencia, r)
    if rechazado:
        # Un documento rechazado bloquea los siguientes y reenviar el mismo código devolvería el rechazado:
        # se borra para poder reenviar corregido.
        try:
            await _borrar(tipo, referencia)
        except HTTPException:
            log.warning("Factus: no se pudo borrar el %s rechazado %s", tipo, referencia)
        raise RechazoDIAN(tipo, referencia, doc.errores)
    if not doc.is_validated:
        # Demora de la DIAN: no se borra nada; reenviar los mismos datos actualiza el estado sin duplicar
        log.info("Factus: %s %s aún sin validar por la DIAN", tipo, referencia)
    return doc


# ---- API pública ----------------------------------------------------------------------------------------------------


async def crear_factura(
    reference_code: str,
    items: list[ItemFactura],
    pago: PagoFactura,
    cliente: ClienteFactura | None = None,
) -> DocumentoOut:
    """POST /v2/bills/validate. cliente=None significa consumidor final.

    Reenviar un reference_code ya procesado devuelve el documento existente. Ver _emitir para 409, rechazo y demora.
    """
    return await _emitir("factura", {
        "reference_code": reference_code,
        "numbering_range_id": await rango_para("factura"),
        "customer": _cliente(cliente),
        "payment_details": [_pago(pago)],
        "items": _items(items),
    })


async def crear_nota_credito(
    reference_code: str,
    factura_numero: str,
    concepto: int,
    items: list[ItemFactura],
    pago: PagoFactura,
    cliente: ClienteFactura | None = None,
) -> DocumentoOut:
    """POST /v2/credit-notes/validate (customization_id "20", bill_number=factura_numero).

    concepto: 1 devolución parcial, 2 anulación, 5 descuento por pronto pago.
    Factus exige payment_details y customer: `pago` es obligatorio y cliente None envía consumidor final.
    La respuesta trae `cude` en vez de `cufe` (DocumentoOut lo expone como cufe).
    """
    return await _emitir("nota_credito", {
        "reference_code": reference_code,
        "numbering_range_id": await rango_para("nota_credito"),
        "correction_concept_code": str(concepto),
        "customization_id": "20",
        "bill_number": factura_numero,
        "customer": _cliente(cliente),
        "payment_details": [_pago(pago)],
        "items": _items(items),
    })


async def crear_nota_debito(
    reference_code: str,
    factura_numero: str,
    concepto: int,
    items: list[ItemFactura],
    pago: PagoFactura,
    cliente: ClienteFactura | None = None,
) -> DocumentoOut:
    """POST /v2/debit-notes/validate (customization_id "30", bill_number=factura_numero).

    concepto: 1 intereses, 2 gastos, 3 cambio del valor, 4 otros.
    Factus exige payment_details y customer: `pago` es obligatorio y cliente None envía consumidor final.
    """
    return await _emitir("nota_debito", {
        "reference_code": reference_code,
        "numbering_range_id": await rango_para("nota_debito"),
        "correction_concept_code": str(concepto),
        "customization_id": "30",
        "bill_number": factura_numero,
        "customer": _cliente(cliente),
        "payment_details": [_pago(pago)],
        "items": _items(items),
    })
