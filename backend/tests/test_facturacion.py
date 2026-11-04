"""Pruebas de services/factus_facturacion.py con httpx mockeado (sin red)."""

import asyncio
import json
import logging
from datetime import date
from decimal import Decimal
from urllib.parse import parse_qs

import httpx
import pytest
from fastapi import HTTPException

from app.schemas.factus import ClienteFactura, ItemFactura, PagoFactura
from app.services import factus_facturacion as fact

CONTADO = PagoFactura(forma="contado", metodo_codigo="10", monto=Decimal("36270.00"))
ITEM19 = ItemFactura(codigo="ACE-1", nombre="Aceite 1 L", cantidad=Decimal(2), precio=Decimal("11500"), iva=19)
ITEM0 = ItemFactura(codigo="ARR-1", nombre="Arroz 500 g", cantidad=Decimal(1), precio=Decimal("2400"), iva=0)

RANGOS = {"data": {"data": [
    {"id": 1776, "document": "Nota Crédito", "is_active": True, "is_expired": False, "to": None, "current": 5},
    {"id": 390, "document": "Nota Crédito", "is_active": True, "is_expired": False, "to": None, "current": 5},
    {"id": 391, "document": "Nota Débito", "is_active": True, "is_expired": False, "to": None, "current": 5},
    {"id": 389, "document": "Factura de Venta", "is_active": True, "is_expired": False, "to": 100, "current": 7},
]}}


def json_resp(status, cuerpo):
    return httpx.Response(status, json=cuerpo)


def doc_ok(request, validado=True, errores=None, nota=False, numero="SETP990000001"):
    """Respuesta 201 de Factus para el reference_code de la petición."""
    ref = json.loads(request.content)["reference_code"]
    data = {
        "reference_code": ref, "number": numero, "is_validated": validado, "errors": errores if errores is not None else {},
        "links": {"qr": "https://dian.example/qr", "public_url": "https://factus.example/p"},
    }
    data["cude" if nota else "cufe"] = "abc123"
    return json_resp(201, {"status": "Created", "message": "ok", "data": data})


class Servidor:
    """Simula Factus: registra las llamadas y responde según (método, ruta)."""

    def __init__(self):
        self.llamadas = []
        self.rutas = {
            ("GET", "/v2/numbering-ranges"): lambda r: json_resp(200, RANGOS),
            ("POST", "/v2/bills/validate"): lambda r: doc_ok(r),
            ("POST", "/v2/credit-notes/validate"): lambda r: doc_ok(r, nota=True),
            ("POST", "/v2/debit-notes/validate"): lambda r: doc_ok(r, nota=True),
        }
        self.tokens = 0

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.llamadas.append(request)
        if request.url.path == "/oauth/token":
            form = {k: v[0] for k, v in parse_qs(request.content.decode()).items()}
            self.tokens += 1
            if form["grant_type"] == "refresh_token" and self.rechaza_refresh:
                return json_resp(401, {"message": "refresh vencido"})
            return json_resp(200, {"token_type": "Bearer", "expires_in": 3600, "access_token": f"tok{self.tokens}", "refresh_token": f"ref{self.tokens}"})
        accion = self.rutas[(request.method, request.url.path)]
        if isinstance(accion, list):
            return accion.pop(0)(request) if len(accion) > 1 else accion[0](request)
        return accion(request)

    rechaza_refresh = False

    def a(self, metodo, ruta):
        return [r for r in self.llamadas if r.method == metodo and r.url.path == ruta]

    def grants(self):
        return [parse_qs(r.content.decode())["grant_type"][0] for r in self.a("POST", "/oauth/token")]

    def cuerpo(self, metodo, ruta, n=0):
        return json.loads(self.a(metodo, ruta)[n].content)


@pytest.fixture
def factus(monkeypatch):
    """Servidor simulado; reinicia el estado del módulo (token, lock, cache de rangos)."""
    servidor = Servidor()
    monkeypatch.setattr(fact, "_http", httpx.AsyncClient(
        base_url="https://factus.test", transport=httpx.MockTransport(servidor), headers={"Accept": "application/json"}
    ))
    monkeypatch.setattr(fact, "_access_token", None)
    monkeypatch.setattr(fact, "_refresh_token", None)
    monkeypatch.setattr(fact, "_vence_en", 0.0)
    monkeypatch.setattr(fact, "_candado", asyncio.Lock())
    fact.limpiar_cache_rangos()
    yield servidor
    fact.limpiar_cache_rangos()


def correr(coro):
    return asyncio.run(coro)


async def _factura(ref="TFXX-VENTA-0001", items=None, pago=CONTADO, cliente=None):
    return await fact.crear_factura(ref, items or [ITEM19, ITEM0], pago, cliente)


# ---- Token -------------------------------------------------------------------------------------------


def test_el_token_se_pide_una_vez_y_se_reutiliza(factus):
    async def flujo():
        await _factura("A-1")
        await _factura("A-2")

    correr(flujo())
    assert factus.grants() == ["password"]
    assert factus.llamadas[1].headers["authorization"] == "Bearer tok1"


def test_ante_401_renueva_con_refresh_token_y_reintenta_una_vez(factus):
    factus.rutas[("POST", "/v2/bills/validate")] = [
        lambda r: json_resp(401, {"message": "Unauthenticated."}),
        lambda r: doc_ok(r),
    ]
    doc = correr(_factura())
    assert doc.is_validated
    assert factus.grants() == ["password", "refresh_token"]
    envios = factus.a("POST", "/v2/bills/validate")
    assert [e.headers["authorization"] for e in envios] == ["Bearer tok1", "Bearer tok2"]
    refresh = parse_qs(factus.a("POST", "/oauth/token")[1].content.decode())
    assert refresh["refresh_token"] == ["ref1"]


def test_si_el_401_persiste_no_reintenta_mas_de_una_vez(factus):
    factus.rutas[("POST", "/v2/bills/validate")] = lambda r: json_resp(401, {"message": "Unauthenticated."})
    with pytest.raises(HTTPException) as e:
        correr(_factura())
    assert e.value.status_code == 502 and "401" in e.value.detail
    assert len(factus.a("POST", "/v2/bills/validate")) == 2


def test_si_el_refresh_token_falla_vuelve_a_iniciar_sesion(factus):
    factus.rechaza_refresh = True
    factus.rutas[("POST", "/v2/bills/validate")] = [lambda r: json_resp(401, {}), lambda r: doc_ok(r)]
    assert correr(_factura()).is_validated
    assert factus.grants() == ["password", "refresh_token", "password"]


def test_renueva_antes_de_que_venza(factus, monkeypatch):
    async def flujo():
        await _factura("B-1")
        monkeypatch.setattr(fact, "_vence_en", 0.0)  # simula que ya venció
        await _factura("B-2")

    correr(flujo())
    assert factus.grants() == ["password", "refresh_token"]
    assert factus.a("POST", "/v2/bills/validate")[1].headers["authorization"] == "Bearer tok2"


def test_dos_peticiones_con_401_renuevan_el_token_una_sola_vez(factus):
    def segun_token(r):
        return json_resp(401, {}) if r.headers["authorization"] == "Bearer tok1" else doc_ok(r)

    factus.rutas[("POST", "/v2/bills/validate")] = segun_token

    async def flujo():
        await fact._token()  # ambas parten con tok1
        return await asyncio.gather(_factura("C-1"), _factura("C-2"))

    docs = correr(flujo())
    assert all(d.is_validated for d in docs)
    assert factus.grants() == ["password", "refresh_token"]  # un solo refresh


def test_no_se_registran_tokens_en_los_logs(factus, caplog):
    caplog.set_level(logging.DEBUG)
    correr(_factura())
    texto = caplog.text
    assert "tok1" not in texto and "ref1" not in texto and "Bearer" not in texto


# ---- Conversión --------------------------------------------------------------------------------------------


def test_items_con_iva_19_y_0(factus):
    correr(_factura())
    a, b = factus.cuerpo("POST", "/v2/bills/validate")["items"]
    assert a == {
        "code_reference": "ACE-1", "name": "Aceite 1 L", "quantity": "2.00", "price": "11500.00",
        "unit_measure_code": "94", "standard_code": "999", "taxes": [{"code": "01", "rate": "19.00"}],
    }
    assert b["quantity"] == "1.00" and b["price"] == "2400.00"
    assert b["taxes"] == [{"code": "01", "rate": "0.00"}]  # IVA 0: taxes con tarifa 0.00, nunca vacío


def test_pago_contado_y_credito(factus):
    credito = PagoFactura(forma="credito", metodo_codigo="47", monto=Decimal("27370"), due_date=date(2026, 12, 15))
    correr(_factura("D-1"))
    correr(_factura("D-2", pago=credito))
    contado, cred = (factus.cuerpo("POST", "/v2/bills/validate", n)["payment_details"] for n in (0, 1))
    assert contado == [{"payment_form": "1", "payment_method_code": "10", "amount": "36270.00"}]  # sin due_date
    assert cred == [{"payment_form": "2", "payment_method_code": "47", "amount": "27370.00", "due_date": "2026-12-15"}]


def test_credito_sin_fecha_falla_antes_de_llamar(factus):
    sin_fecha = PagoFactura(forma="credito", metodo_codigo="47", monto=Decimal("100"))
    with pytest.raises(HTTPException) as e:
        correr(_factura(pago=sin_fecha))
    assert e.value.status_code == 422 and "vencimiento" in e.value.detail
    assert factus.a("POST", "/v2/bills/validate") == []


def test_cliente_none_es_consumidor_final(factus):
    correr(_factura())
    assert factus.cuerpo("POST", "/v2/bills/validate")["customer"] == {
        "identification_document_code": "13", "identification": "22222222222", "names": "Consumidor Final",
    }


def test_empresa_usa_company_y_persona_usa_names(factus):
    empresa = ClienteFactura(tipo_documento="31", documento="900.123.456-8", nombres="El Fogón", es_empresa=True,
                             razon_social="Restaurante El Fogón SAS", email="f@x.co")
    natural = ClienteFactura(tipo_documento="13", documento="52123456", nombres="Marta Rodríguez", telefono="300")
    correr(_factura("E-1", cliente=empresa))
    correr(_factura("E-2", cliente=natural))
    e, n = (factus.cuerpo("POST", "/v2/bills/validate", i)["customer"] for i in (0, 1))
    assert e == {"identification_document_code": "31", "identification": "900123456", "legal_organization_code": "1",
                 "company": "Restaurante El Fogón SAS", "email": "f@x.co"}  # NIT sin dígito; el dv lo calcula Factus
    assert n == {"identification_document_code": "13", "identification": "52123456", "legal_organization_code": "2",
                 "names": "Marta Rodríguez", "phone": "300"}


def test_la_factura_lleva_el_rango_elegido(factus):
    correr(_factura())
    assert factus.cuerpo("POST", "/v2/bills/validate")["numbering_range_id"] == 389


def test_nota_credito_y_debito(factus):
    pago = PagoFactura(forma="contado", metodo_codigo="47", monto=Decimal("13685"))
    nc = correr(fact.crear_nota_credito("TFXX-NC-0001-1", "SETP990000001", 1, [ITEM19], pago))
    nd = correr(fact.crear_nota_debito("TFXX-ND-0001-1", "SETP990000001", 3, [ITEM19], pago))
    c = factus.cuerpo("POST", "/v2/credit-notes/validate")
    assert (c["customization_id"], c["bill_number"], c["correction_concept_code"]) == ("20", "SETP990000001", "1")
    assert c["numbering_range_id"] == 1776 and c["customer"]["names"] == "Consumidor Final"
    assert c["payment_details"][0]["payment_method_code"] == "47"
    d = factus.cuerpo("POST", "/v2/debit-notes/validate")
    assert (d["customization_id"], d["correction_concept_code"], d["numbering_range_id"]) == ("30", "3", 391)
    assert nc.cufe == "abc123" and nc.tipo == "nota_credito"  # la nota trae cude: se expone como cufe
    assert nd.tipo == "nota_debito"


def test_respuesta_de_factura_a_documento_out(factus):
    doc = correr(_factura())
    assert (doc.tipo, doc.numero, doc.cufe, doc.is_validated) == ("factura", "SETP990000001", "abc123", True)
    assert doc.public_url == "https://factus.example/p" and doc.qr_url == "https://dian.example/qr"
    assert doc.errores is None  # {} -> None


# ---- Errores y avisos -------------------------------------------------------------------------------------------


def test_un_aviso_faj44b_no_es_un_fallo(factus):
    avisos = {"FAJ44b": "Regla: FAJ44b, Notificación: Nit No corresponde al RUT", "RUT01": "Regla: RUT01, Notificación: ..."}
    factus.rutas[("POST", "/v2/bills/validate")] = lambda r: doc_ok(r, errores=avisos)
    doc = correr(_factura())
    assert doc.is_validated and doc.errores == avisos


def test_los_avisos_de_una_nota_vienen_como_lista(factus):
    factus.rutas[("POST", "/v2/credit-notes/validate")] = lambda r: doc_ok(r, nota=True, errores=["Regla: CBF02, Notificación: ..."])
    doc = correr(fact.crear_nota_credito("N-1", "SETP1", 2, [ITEM19], CONTADO))
    assert doc.is_validated and doc.errores == ["Regla: CBF02, Notificación: ..."]


def test_rechazo_de_la_dian_lanza_excepcion_propia_y_borra_el_documento(factus):
    rechazo = {"FAJ43b": "Regla: FAJ43b, Rechazo: Nombre informado no corresponde al registrado en el RUT"}
    factus.rutas[("POST", "/v2/bills/validate")] = lambda r: doc_ok(r, validado=False, errores=rechazo)
    factus.rutas[("DELETE", "/v2/bills/destroy/reference/TFXX-VENTA-0009")] = lambda r: json_resp(200, {"status": "ok"})
    with pytest.raises(fact.RechazoDIAN) as e:
        correr(_factura("TFXX-VENTA-0009"))
    assert e.value.status_code == 422
    assert "La DIAN rechazó la factura TFXX-VENTA-0009" in e.value.detail and "FAJ43b" in e.value.detail
    assert len(factus.a("DELETE", "/v2/bills/destroy/reference/TFXX-VENTA-0009")) == 1


def test_demora_de_la_dian_devuelve_no_validada_sin_borrar(factus):
    pendientes = {"RUT01": "Regla: RUT01, Notificación: pendiente"}
    factus.rutas[("POST", "/v2/bills/validate")] = lambda r: doc_ok(r, validado=False, errores=pendientes)
    doc = correr(_factura())
    assert doc.is_validated is False and doc.numero == "SETP990000001"
    assert [r.method for r in factus.llamadas if r.method == "DELETE"] == []


def test_409_borra_el_pendiente_y_reenvia_una_vez(factus):
    factus.rutas[("POST", "/v2/bills/validate")] = [
        lambda r: json_resp(409, {"message": "Se encontró una factura pendiente por enviar a la DIAN"}),
        lambda r: doc_ok(r),
    ]
    factus.rutas[("DELETE", "/v2/bills/destroy/reference/TFXX-VENTA-0001")] = lambda r: json_resp(200, {"status": "ok"})
    doc = correr(_factura())
    assert doc.is_validated
    orden = [(r.method, r.url.path) for r in factus.llamadas if "/v2/" in r.url.path and "ranges" not in r.url.path]
    assert orden == [
        ("POST", "/v2/bills/validate"),
        ("DELETE", "/v2/bills/destroy/reference/TFXX-VENTA-0001"),
        ("POST", "/v2/bills/validate"),
    ]


def test_409_en_notas_usa_el_delete_de_notas(factus):
    factus.rutas[("POST", "/v2/credit-notes/validate")] = [lambda r: json_resp(409, {}), lambda r: doc_ok(r, nota=True)]
    factus.rutas[("DELETE", "/v2/credit-notes/reference/N-1")] = lambda r: json_resp(200, {})
    assert correr(fact.crear_nota_credito("N-1", "SETP1", 2, [ITEM19], CONTADO)).is_validated
    assert len(factus.a("DELETE", "/v2/credit-notes/reference/N-1")) == 1


def test_409_persistente_avisa_que_puede_ser_de_otro_equipo(factus):
    factus.rutas[("POST", "/v2/bills/validate")] = lambda r: json_resp(409, {"message": "pendiente"})
    factus.rutas[("DELETE", "/v2/bills/destroy/reference/TFXX-VENTA-0001")] = lambda r: json_resp(200, {})
    with pytest.raises(fact.ConflictoPendiente) as e:
        correr(_factura())
    assert e.value.status_code == 409 and "otro equipo" in e.value.detail
    assert len(factus.a("POST", "/v2/bills/validate")) == 2  # reenvía una sola vez


def test_409_cuyo_pendiente_no_es_nuestro_no_reenvia(factus):
    factus.rutas[("POST", "/v2/bills/validate")] = lambda r: json_resp(409, {"message": "pendiente"})
    factus.rutas[("DELETE", "/v2/bills/destroy/reference/TFXX-VENTA-0001")] = lambda r: json_resp(
        404, {"message": "No se encontró el documento con código de referencia TFXX-VENTA-0001"}
    )
    with pytest.raises(fact.ConflictoPendiente) as e:
        correr(_factura())
    assert "otro equipo" in e.value.detail
    assert len(factus.a("POST", "/v2/bills/validate")) == 1


def test_error_de_validacion_422_se_traduce_a_un_mensaje_claro(factus):
    factus.rutas[("POST", "/v2/bills/validate")] = lambda r: json_resp(422, {
        "status": "Validation error", "message": "Error de validación",
        "data": {"message": "Error de validación", "errors": {"items.0.price": ["El campo precio es obligatorio."]}},
    })
    with pytest.raises(HTTPException) as e:
        correr(_factura())
    assert e.value.status_code == 422
    assert "items.0.price: El campo precio es obligatorio." in e.value.detail


def test_timeout_se_informa_en_espanol(factus):
    def lento(r):
        raise httpx.ReadTimeout("lento")

    factus.rutas[("POST", "/v2/bills/validate")] = lento
    with pytest.raises(HTTPException) as e:
        correr(_factura())
    assert e.value.status_code == 504 and "tardó demasiado" in e.value.detail


def test_documento_sin_productos(factus):
    with pytest.raises(HTTPException) as e:
        correr(fact.crear_factura("X-1", [], CONTADO))
    assert e.value.status_code == 422


# ---- Rangos ---------------------------------------------------------------------------------------------------------


def test_los_rangos_se_cachean(factus):
    async def flujo():
        for ref in ("R-1", "R-2", "R-3"):
            await _factura(ref)

    correr(flujo())
    assert len(factus.a("GET", "/v2/numbering-ranges")) == 1


def test_rango_forzado_por_env_no_consulta_a_factus(factus, monkeypatch):
    monkeypatch.setattr(fact.settings, "factus_rango_nc", 390)
    assert correr(fact.rango_para("nota_credito")) == 390
    assert factus.a("GET", "/v2/numbering-ranges") == []


def test_rango_vencido_o_agotado_se_salta(factus):
    factus.rutas[("GET", "/v2/numbering-ranges")] = lambda r: json_resp(200, {"data": {"data": [
        {"id": 1, "document": "Factura de Venta", "is_active": True, "is_expired": True, "to": None, "current": 1},
        {"id": 2, "document": "Factura de Venta", "is_active": True, "is_expired": False, "to": 10, "current": 10},
        {"id": 3, "document": "Factura de Venta", "is_active": True, "is_expired": False, "to": 10, "current": 3},
    ]}})
    assert correr(fact.rango_para("factura")) == 3
    with pytest.raises(HTTPException):
        correr(fact.rango_para("nota_debito"))
