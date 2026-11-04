"""Pruebas del webhook de Factus Pay (POST /api/webhooks/factus-pay) con FACTUS_MODE=fake."""

import logging
import os

from sqlalchemy import select

from app.models import MovimientoInventario, WebhookEvento
from app.services import fakes

URL = "/api/webhooks/factus-pay"
KEY = os.environ["FACTUS_PAY_WEBHOOK_KEY"]


def venta_digital(api, precio=10000, cantidad=2):
    p = api.post("/api/productos", json={"nombre": "Arroz", "precio": precio, "iva": 0, "stock": 20, "stock_minimo": 1}).json()
    v = api.post("/api/ventas", json={"tipo_pago": "digital", "items": [{"producto_id": p["id"], "cantidad": cantidad}]}).json()
    return p, v


def eventos(sesion):
    with sesion() as db:
        return list(db.scalars(select(WebhookEvento).order_by(WebhookEvento.id)).all())


def stock(api, pid):
    return next(p["stock"] for p in api.get("/api/productos").json() if p["id"] == pid)


def test_con_la_key_correcta_la_venta_pasa_a_pagada(api, sesion):
    p, v = venta_digital(api)
    ref = v["reference_code"]
    fakes.PAGADOS.add(ref)  # Factus Pay ya lo marca paid

    r = api.post(f"{URL}?key={KEY}", json={"reference_code": ref, "status": "paid"})
    assert r.status_code == 200 and r.json() == {"ok": True}

    v = api.get(f"/api/ventas/{v['id']}").json()
    assert v["estado"] == "pagada" and v["recaudos"][0]["estado"] == "paid"
    assert [d["tipo"] for d in v["documentos"]] == ["factura"]
    assert stock(api, p["id"]) == 18
    (e,) = eventos(sesion)
    assert e.reference_code == ref and e.procesado_at is not None and "_nota" not in e.payload


def test_acepta_el_codigo_dentro_de_data(api, sesion):
    _, v = venta_digital(api)
    fakes.PAGADOS.add(v["reference_code"])
    r = api.post(f"{URL}?key={KEY}", json={"data": {"reference_code": v["reference_code"], "status": "paid"}})
    assert r.status_code == 200
    assert api.get(f"/api/ventas/{v['id']}").json()["estado"] == "pagada"


def test_key_incorrecta_o_ausente_da_401_y_no_cambia_nada(api, sesion):
    p, v = venta_digital(api)
    fakes.PAGADOS.add(v["reference_code"])
    cuerpo = {"reference_code": v["reference_code"]}

    assert api.post(f"{URL}?key=otra", json=cuerpo).status_code == 401
    assert api.post(URL, json=cuerpo).status_code == 401
    assert api.post(f"{URL}?key=", json=cuerpo).status_code == 401

    assert api.get(f"/api/ventas/{v['id']}").json()["estado"] == "esperando_pago"
    assert stock(api, p["id"]) == 20
    assert eventos(sesion) == []  # ni siquiera se guarda


def test_llegada_duplicada_procesa_una_sola_vez(api, sesion):
    p, v = venta_digital(api)
    ref = v["reference_code"]
    fakes.PAGADOS.add(ref)

    for _ in range(3):  # Factus reintenta hasta 6 veces
        assert api.post(f"{URL}?key={KEY}", json={"reference_code": ref}).json() == {"ok": True}

    v = api.get(f"/api/ventas/{v['id']}").json()
    assert stock(api, p["id"]) == 18
    assert len(v["documentos"]) == 1
    with sesion() as db:
        assert len(db.scalars(select(MovimientoInventario).where(MovimientoInventario.producto_id == p["id"], MovimientoInventario.tipo == "venta")).all()) == 1
    assert len(eventos(sesion)) == 3  # cada llegada queda registrada


def test_si_pay_aun_no_lo_marca_paid_no_cambia_la_venta(api, sesion):
    _, v = venta_digital(api)
    r = api.post(f"{URL}?key={KEY}", json={"reference_code": v["reference_code"]})
    assert r.status_code == 200
    assert api.get(f"/api/ventas/{v['id']}").json()["estado"] == "esperando_pago"  # no se confía en el payload


def test_payload_sin_reference_code_responde_200_y_deja_nota(api, sesion):
    r = api.post(f"{URL}?key={KEY}", json={"status": "paid"})
    assert r.status_code == 200 and r.json() == {"ok": True}
    (e,) = eventos(sesion)
    assert e.reference_code == "" and "reference_code" in e.payload["_nota"] and e.procesado_at is None


def test_cuerpo_que_no_es_json_responde_200(api, sesion):
    r = api.post(f"{URL}?key={KEY}", content=b"no es json", headers={"Content-Type": "text/plain"})
    assert r.status_code == 200
    (e,) = eventos(sesion)
    assert "JSON" in e.payload["_nota"]


def test_reference_code_desconocido_responde_200_y_deja_nota(api, sesion):
    r = api.post(f"{URL}?key={KEY}", json={"reference_code": "TFXX-VENTA-9999"})
    assert r.status_code == 200 and r.json() == {"ok": True}
    (e,) = eventos(sesion)
    assert e.reference_code == "TFXX-VENTA-9999" and "No existe" in e.payload["_nota"] and e.procesado_at is None


def test_un_error_inesperado_no_rompe_el_200_y_queda_anotado(api, sesion, monkeypatch):
    from app.services import ventas

    async def falla(*a, **k):
        raise RuntimeError("secreto-que-no-debe-salir")

    monkeypatch.setattr(ventas, "procesar_pago_confirmado", falla)
    r = api.post(f"{URL}?key={KEY}", json={"reference_code": "TFXX-VENTA-1"})
    assert r.status_code == 200
    (e,) = eventos(sesion)
    assert "RuntimeError" in e.payload["_nota"] and "secreto" not in e.payload["_nota"]


def test_no_se_registran_la_key_ni_el_payload_en_los_logs(api, caplog):
    caplog.set_level(logging.DEBUG)
    api.post(f"{URL}?key={KEY}", json={"reference_code": "TFXX-VENTA-9999", "dato_sensible": "valor-raro-123"})
    api.post(f"{URL}?key=otra", json={"reference_code": "x"})
    # Solo los logs de la app: el cliente de pruebas (httpx) imprime su propia URL
    propios = "\n".join(r.getMessage() for r in caplog.records if r.name.startswith("app."))
    assert KEY not in propios and "valor-raro-123" not in propios
