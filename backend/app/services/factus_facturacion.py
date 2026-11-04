"""Cliente real de Factus Facturación (factura, nota crédito y nota débito).

Hechos verificados en AGENTS.md. Implementado: token, listar_rangos y elección de rango.
Pendiente: Facturación (crear_factura, crear_nota_credito, crear_nota_debito).
"""

import asyncio
import time
from typing import Literal

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

_http = _crear_cliente(settings.factus_base_url)
_candado = asyncio.Lock()
_access_token: str | None = None
_refresh_token: str | None = None
_vence_en: float = 0.0  # time.monotonic() a partir del cual hay que renovar


async def _pedir_token(form: dict) -> None:
    global _access_token, _refresh_token, _vence_en
    r = await _http.post("/oauth/token", data=form)
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="No se pudo autenticar en Factus Facturación")
    d = r.json()
    _access_token, _refresh_token = d["access_token"], d.get("refresh_token")
    _vence_en = time.monotonic() + int(d.get("expires_in", 600)) - 30  # margen: la doc y el ejemplo difieren


async def _token(forzar: bool = False) -> str:
    """Token en memoria; se renueva con el refresh_token (o con login) al vencer o ante un 401."""
    async with _candado:
        if forzar or _access_token is None or time.monotonic() >= _vence_en:
            credenciales = {"client_id": settings.factus_client_id, "client_secret": settings.factus_client_secret}
            if _refresh_token:
                await _pedir_token({"grant_type": "refresh_token", "refresh_token": _refresh_token, **credenciales})
            else:
                await _pedir_token({
                    "grant_type": "password",
                    "username": settings.factus_username,
                    "password": settings.factus_password,
                    **credenciales,
                })
        return _access_token  # type: ignore[return-value]


async def _pedir(metodo: str, ruta: str, **kwargs) -> httpx.Response:
    """Llama con el token; ante un 401 renueva el token y reintenta una vez."""
    for intento in range(2):
        token = await _token(forzar=intento == 1)
        try:
            r = await _http.request(metodo, ruta, headers={"Authorization": f"Bearer {token}"}, **kwargs)
        except httpx.HTTPError:
            raise HTTPException(status_code=502, detail="No se pudo conectar con Factus Facturación")
        if r.status_code != 401:
            return r
    return r


async def listar_rangos() -> list[dict]:
    """GET /v2/numbering-ranges?filter[is_active]=1. Devuelve la lista `data.data` tal cual."""
    r = await _pedir("GET", "/v2/numbering-ranges", params={"filter[is_active]": 1})
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="No se pudieron consultar los rangos de numeración")
    d = r.json().get("data", [])
    return d if isinstance(d, list) else d.get("data", [])


_NOMBRE_RANGO = {"factura": "factura de venta", "nota_credito": "nota crédito", "nota_debito": "nota débito"}


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


async def rango_para(tipo: Literal["factura", "nota_credito", "nota_debito"]) -> int:
    """Id del rango de numeración (`numbering_range_id`) para el tipo de documento.

    Si FACTUS_RANGO_FACTURA / FACTUS_RANGO_NC / FACTUS_RANGO_ND está definido se usa ese.
    Si no, el primer rango activo, no vencido y con consecutivos disponibles que devuelve Factus
    para ese documento (si hay varios, el que Factus lista primero).
    """
    forzado = _rango_forzado(tipo)
    if forzado is not None:
        return forzado
    nombre = _NOMBRE_RANGO[tipo]
    for r in await listar_rangos():
        if str(r.get("document", "")).lower() == nombre and _rango_usable(r):
            return int(r["id"])
    raise HTTPException(
        status_code=409,
        detail=f"No hay un rango de numeración activo y vigente para {nombre}; define el id en el .env",
    )


async def crear_factura(
    reference_code: str,
    items: list[ItemFactura],
    pago: PagoFactura,
    cliente: ClienteFactura | None = None,
) -> DocumentoOut:
    """POST /v2/bills/validate. cliente=None significa consumidor final.

    Pago en `payment_details: [{payment_form, payment_method_code, amount, due_date}]`.
    Ante 409 (pendiente ante la DIAN): DELETE /v2/bills/destroy/reference/{reference_code} y reenviar.
    """
    raise NotImplementedError("Pendiente: Facturación")


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
    Factus exige customer y payment_details: `pago` es obligatorio y, si cliente es None,
    se envía el consumidor final. La respuesta trae `cude` en vez de `cufe` (DocumentoOut lo mapea).
    """
    raise NotImplementedError("Pendiente: Facturación")


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
    Factus exige customer y payment_details: `pago` es obligatorio y, si cliente es None,
    se envía el consumidor final.
    """
    raise NotImplementedError("Pendiente: Facturación")
