"""Pruebas de extremo a extremo del núcleo con FACTUS_MODE=fake y SQLite en memoria."""

import asyncio

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.models import MovimientoInventario, Producto
from app.services import fakes, seed, ventas


# ---- Utilidades --------------------------------------------------------------------------------


def producto(api, nombre="Arroz", precio=10000, iva=0, stock=20, minimo=2, **extra):
    r = api.post("/api/productos", json={"nombre": nombre, "precio": precio, "iva": iva, "stock": stock, "stock_minimo": minimo, **extra})
    assert r.status_code == 201, r.text
    return r.json()


def cliente(api, documento="52123456", nombres="Marta Rodríguez"):
    r = api.post("/api/clientes", json={"tipo_documento": "13", "documento": documento, "nombres": nombres})
    assert r.status_code == 201, r.text
    return r.json()


def vender(api, tipo, items, **extra):
    r = api.post("/api/ventas", json={"tipo_pago": tipo, "items": [{"producto_id": p, "cantidad": c} for p, c in items], **extra})
    return r


def stock(api, producto_id):
    return next(p["stock"] for p in api.get("/api/productos").json() if p["id"] == producto_id)


def pagar(api, referencia):
    r = api.post(f"/api/dev/simular-pago/{referencia}")
    assert r.status_code == 200, r.text


def movimientos(sesion, producto_id, tipo=None):
    with sesion() as db:
        consulta = select(MovimientoInventario).where(MovimientoInventario.producto_id == producto_id)
        if tipo:
            consulta = consulta.where(MovimientoInventario.tipo == tipo)
        return list(db.scalars(consulta).all())


# ---- 1. Productos y clientes -------------------------------------------------------------------


def test_productos_crud_busqueda_y_entrada(api, sesion):
    a = producto(api, "Arroz Diana", 2400, stock=5, minimo=10, codigo="A1")
    b = producto(api, "Leche Alquería", 4200, stock=30, minimo=5)
    assert {p["nombre"] for p in api.get("/api/productos").json()} == {"Arroz Diana", "Leche Alquería"}
    assert [p["id"] for p in api.get("/api/productos?q=arroz").json()] == [a["id"]]
    assert [p["id"] for p in api.get("/api/productos?q=A1").json()] == [a["id"]]
    assert [p["id"] for p in api.get("/api/productos?bajo_stock=true").json()] == [a["id"]]

    assert api.post("/api/productos", json={"nombre": "Otro", "precio": 1, "iva": 0, "stock": 1, "stock_minimo": 0, "codigo": "A1"}).status_code == 409

    r = api.put(f"/api/productos/{b['id']}", json={"precio": 4500})
    assert r.status_code == 200 and r.json()["precio"] == 4500 and r.json()["nombre"] == "Leche Alquería"
    assert api.put("/api/productos/999", json={"precio": 1}).status_code == 404

    r = api.post(f"/api/productos/{a['id']}/entrada", json={"cantidad": 10, "nota": "Compra"})
    assert r.json()["stock"] == 15
    assert [m.cantidad for m in movimientos(sesion, a["id"], "entrada")] == [5, 10]  # stock inicial + entrada

    api.put(f"/api/productos/{b['id']}", json={"activo": False})
    assert [p["id"] for p in api.get("/api/productos").json()] == [a["id"]]  # inactivos no se listan


def test_clientes_busqueda_y_duplicado(api):
    c = cliente(api)
    cliente(api, "900123456", "Restaurante El Fogón")
    assert [x["id"] for x in api.get("/api/clientes?q=marta").json()] == [c["id"]]
    assert [x["nombres"] for x in api.get("/api/clientes?q=9001").json()] == ["Restaurante El Fogón"]
    r = api.post("/api/clientes", json={"tipo_documento": "13", "documento": "52123456", "nombres": "Otra"})
    assert r.status_code == 409


def test_seed_es_idempotente(sesion):
    with sesion() as db:
        assert seed.sembrar_productos(db) == 15
        assert seed.sembrar_productos(db) == 0
        assert len(db.scalars(select(Producto)).all()) == 15


# ---- 2. Efectivo -------------------------------------------------------------------------------


def test_efectivo_sin_factura(api, sesion):
    a = producto(api, precio=10000, stock=20)
    b = producto(api, "Aceite", 11500, iva=19, stock=10)
    r = vender(api, "efectivo", [(a["id"], 2), (b["id"], 1)])
    assert r.status_code == 201, r.text
    v = r.json()
    assert v["reference_code"] == "TFXX-VENTA-0001"
    assert v["estado"] == "pagada" and v["total"] == 20000 + 13685 and v["saldo"] == 0
    assert v["documentos"] == [] and v["recaudos"] == [] and v["factura_pendiente"] is False
    assert stock(api, a["id"]) == 18 and stock(api, b["id"]) == 9
    assert [m.cantidad for m in movimientos(sesion, a["id"], "venta")] == [-2]


def test_efectivo_facturado_a_cliente(api):
    a = producto(api)
    c = cliente(api)
    v = vender(api, "efectivo", [(a["id"], 1)], facturar=True, cliente_id=c["id"]).json()
    assert v["cliente"]["id"] == c["id"]
    (doc,) = v["documentos"]
    assert doc["tipo"] == "factura" and doc["is_validated"] and doc["numero"].startswith("FAKE-")
    assert doc["reference_code"] == v["reference_code"]


def test_stock_insuficiente_da_400_y_no_cambia_nada(api):
    a = producto(api, stock=2)
    r = vender(api, "efectivo", [(a["id"], 3)])
    assert r.status_code == 400
    assert "Stock insuficiente" in r.json()["detail"]
    assert stock(api, a["id"]) == 2 and api.get("/api/ventas").json() == []


def test_producto_o_cliente_inexistente(api):
    assert vender(api, "efectivo", [(999, 1)]).status_code == 404
    a = producto(api)
    assert vender(api, "efectivo", [(a["id"], 1)], cliente_id=999).status_code == 404


# ---- 3-5. Digital ------------------------------------------------------------------------------


def test_digital_con_simulacion_de_pago(api):
    a = producto(api, precio=10000, stock=20)
    v = vender(api, "digital", [(a["id"], 1)]).json()
    assert v["estado"] == "esperando_pago" and v["saldo"] == 10000
    (rec,) = v["recaudos"]
    assert rec["tipo"] == "venta" and rec["monto"] == 10000 and rec["estado"] == "ready"
    assert rec["reference_code"] == v["reference_code"] and rec["breb_key"] and rec["qr"].startswith("data:image/png")
    assert stock(api, a["id"]) == 20  # todavía no se descuenta

    pagar(api, v["reference_code"])
    v = api.get(f"/api/ventas/{v['id']}").json()
    assert v["estado"] == "pagada" and v["saldo"] == 0
    assert v["recaudos"][0]["estado"] == "paid" and v["recaudos"][0]["collected_at"]
    assert [d["tipo"] for d in v["documentos"]] == ["factura"]
    assert stock(api, a["id"]) == 19


def test_procesar_pago_confirmado_es_idempotente(api, sesion):
    a = producto(api, precio=10000, stock=20)
    v = vender(api, "digital", [(a["id"], 2)]).json()
    ref = v["reference_code"]
    fakes.PAGADOS.add(ref)

    assert asyncio.run(ventas.procesar_pago_confirmado(ref)) is True  # sin db: abre su propia sesión
    assert asyncio.run(ventas.procesar_pago_confirmado(ref)) is False  # el webhook reenvía: no hace nada
    pagar(api, ref)  # y otra vez por el simulador

    v = api.get(f"/api/ventas/{v['id']}").json()
    assert stock(api, a["id"]) == 18  # se descontó una sola vez
    assert len(v["documentos"]) == 1
    assert len(movimientos(sesion, a["id"], "venta")) == 1


def test_procesar_pago_no_actua_si_pay_aun_no_lo_marca_paid(api):
    a = producto(api)
    v = vender(api, "digital", [(a["id"], 1)]).json()
    assert asyncio.run(ventas.procesar_pago_confirmado(v["reference_code"])) is False
    assert api.get(f"/api/ventas/{v['id']}").json()["estado"] == "esperando_pago"


def test_procesar_pago_rechaza_monto_distinto(api, sesion):
    a = producto(api)
    v = vender(api, "digital", [(a["id"], 1)]).json()
    from app.models import Recaudo

    with sesion() as db:
        db.scalar(select(Recaudo)).monto = 15000  # el recaudo local ya no coincide con el de Pay
        db.commit()
    fakes.PAGADOS.add(v["reference_code"])
    with pytest.raises(HTTPException) as e:
        asyncio.run(ventas.procesar_pago_confirmado(v["reference_code"]))
    assert e.value.status_code == 409 and "no coincide" in e.value.detail
    assert api.get(f"/api/ventas/{v['id']}").json()["estado"] == "esperando_pago"


def test_refrescar_pago_es_el_respaldo_del_webhook(api):
    a = producto(api, precio=10000)
    v = vender(api, "digital", [(a["id"], 1)]).json()
    r = api.post(f"/api/ventas/{v['id']}/refrescar-pago")
    assert r.json()["estado"] == "esperando_pago"  # aún no pagado

    fakes.PAGADOS.add(v["reference_code"])  # Pay lo marca pagado pero el webhook nunca llegó
    r = api.post(f"/api/ventas/{v['id']}/refrescar-pago")
    assert r.json()["estado"] == "pagada" and len(r.json()["documentos"]) == 1


def test_digital_con_monto_menor_al_minimo_de_pay(api):
    barato = producto(api, "Chicle", 5000)
    r = vender(api, "digital", [(barato["id"], 1)])
    assert r.status_code == 422
    assert "$10.000" in r.json()["detail"]
    assert api.get("/api/ventas").json() == []  # no se creó nada


# ---- 6. Fiado ----------------------------------------------------------------------------------


def test_fiado_con_dos_abonos(api):
    b = producto(api, "Aceite", 11500, iva=19, stock=10)
    c = cliente(api)

    assert vender(api, "fiado", [(b["id"], 2)], due_date="2099-12-15").status_code == 422  # sin cliente
    assert vender(api, "fiado", [(b["id"], 2)], cliente_id=c["id"]).status_code == 422  # sin fecha
    assert vender(api, "fiado", [(b["id"], 2)], cliente_id=c["id"], due_date="2000-01-01").status_code == 422

    v = vender(api, "fiado", [(b["id"], 2)], cliente_id=c["id"], due_date="2099-12-15").json()
    assert v["estado"] == "fiado_abierto" and v["total"] == 27370 and v["saldo"] == 27370
    assert [d["tipo"] for d in v["documentos"]] == ["factura"] and stock(api, b["id"]) == 8

    cartera = api.get(f"/api/clientes/{c['id']}/cartera").json()
    assert cartera["saldo_total"] == 27370 and cartera["ventas"][0]["abonado"] == 0

    # Validaciones del abono
    assert api.post(f"/api/ventas/{v['id']}/abonos", json={"monto": 9999}).status_code == 422
    r = api.post(f"/api/ventas/{v['id']}/abonos", json={"monto": 30000})
    assert r.status_code == 422 and "superar el saldo" in r.json()["detail"]

    # Abono 1
    v = api.post(f"/api/ventas/{v['id']}/abonos", json={"monto": 10000}).json()
    ab1 = v["recaudos"][0]
    assert ab1["tipo"] == "abono" and ab1["reference_code"] == f"{v['reference_code']}-AB1" and ab1["qr"]
    assert v["saldo"] == 27370  # sin pagar no baja
    pagar(api, ab1["reference_code"])
    v = api.get(f"/api/ventas/{v['id']}").json()
    assert v["saldo"] == 17370 and v["estado"] == "fiado_abierto"
    assert api.get(f"/api/clientes/{c['id']}/cartera").json()["ventas"][0]["abonado"] == 10000

    # Abono 2 por el resto
    v = api.post(f"/api/ventas/{v['id']}/abonos", json={"monto": 17370}).json()
    ab2 = v["recaudos"][1]
    assert ab2["reference_code"] == f"{v['reference_code']}-AB2"
    pagar(api, ab2["reference_code"])
    v = api.get(f"/api/ventas/{v['id']}").json()
    assert v["saldo"] == 0 and v["estado"] == "fiado_pagado"
    assert api.get(f"/api/clientes/{c['id']}/cartera").json() == {"cliente": c, "saldo_total": 0, "ventas": []}
    assert api.post(f"/api/ventas/{v['id']}/abonos", json={"monto": 10000}).status_code == 409


def test_abono_solo_para_fiados(api):
    a = producto(api)
    v = vender(api, "efectivo", [(a["id"], 1)]).json()
    assert api.post(f"/api/ventas/{v['id']}/abonos", json={"monto": 10000}).status_code == 409


# ---- 7. Nota crédito ---------------------------------------------------------------------------


def test_devolucion_parcial_y_anulacion(api, sesion):
    a = producto(api, "Arroz", 10000, stock=20)
    b = producto(api, "Aceite", 11500, iva=19, stock=10)
    v = vender(api, "efectivo", [(a["id"], 1), (b["id"], 2)], facturar=True).json()
    assert v["total"] == 10000 + 27370 and stock(api, b["id"]) == 8
    url = f"/api/ventas/{v['id']}/nota-credito"

    # Devolución parcial de 1 aceite
    r = api.post(url, json={"concepto": 1, "items": [{"producto_id": b["id"], "cantidad": 1}]})
    assert r.status_code == 200, r.text
    nc = r.json()["documentos"][-1]
    assert nc["tipo"] == "nota_credito" and nc["monto"] == 13685 and nc["reference_code"] == f"TFXX-NC-{v['id']:04d}-1"
    assert nc["factura_origen_id"] == v["documentos"][0]["id"]
    assert stock(api, b["id"]) == 9 and [m.cantidad for m in movimientos(sesion, b["id"], "devolucion")] == [1]

    # No se puede devolver más de lo vendido
    r = api.post(url, json={"concepto": 1, "items": [{"producto_id": b["id"], "cantidad": 2}]})
    assert r.status_code == 422 and "Solo se pueden devolver 1" in r.json()["detail"]
    assert api.post(url, json={"concepto": 1}).status_code == 422  # sin items

    # Anulación de lo que queda
    r = api.post(url, json={"concepto": 2})
    v2 = r.json()
    assert r.status_code == 200 and v2["estado"] == "anulada" and v2["saldo"] == 0
    assert v2["documentos"][-1]["monto"] == 10000 + 13685 and v2["documentos"][-1]["reference_code"].endswith("-2")
    assert stock(api, a["id"]) == 20 and stock(api, b["id"]) == 10
    assert v2["devolver_manual"] is None  # se pagó en efectivo
    assert api.post(url, json={"concepto": 2}).status_code == 409  # ya anulada


def test_nota_credito_exige_factura_validada(api):
    a = producto(api)
    v = vender(api, "efectivo", [(a["id"], 1)]).json()  # sin facturar
    r = api.post(f"/api/ventas/{v['id']}/nota-credito", json={"concepto": 2})
    assert r.status_code == 409 and "factura" in r.json()["detail"]


def test_anulacion_de_venta_pagada_con_qr_pide_devolver_a_mano(api):
    a = producto(api, precio=10000)
    v = vender(api, "digital", [(a["id"], 1)]).json()
    pagar(api, v["reference_code"])
    assert api.get(f"/api/ventas/{v['id']}").json()["devolver_manual"] is None
    v = api.post(f"/api/ventas/{v['id']}/nota-credito", json={"concepto": 2}).json()
    assert v["estado"] == "anulada" and v["devolver_manual"] == 10000
    assert stock(api, a["id"]) == 20


def test_nota_credito_falla_en_factus_no_cambia_nada(api, monkeypatch):
    a = producto(api)
    v = vender(api, "efectivo", [(a["id"], 1)], facturar=True).json()

    async def caido(*args, **kwargs):
        raise RuntimeError("sin conexión")

    monkeypatch.setattr(fakes, "crear_nota_credito", caido)
    r = api.post(f"/api/ventas/{v['id']}/nota-credito", json={"concepto": 2})
    assert r.status_code == 502 and "sin conexión" in r.json()["detail"]
    v = api.get(f"/api/ventas/{v['id']}").json()
    assert v["estado"] == "pagada" and len(v["documentos"]) == 1 and stock(api, a["id"]) == 19


def test_descuento_por_pronto_pago_baja_el_saldo_del_fiado(api):
    b = producto(api, "Aceite", 11500, iva=19, stock=10)
    c = cliente(api)
    v = vender(api, "fiado", [(b["id"], 2)], cliente_id=c["id"], due_date="2099-12-15").json()
    url = f"/api/ventas/{v['id']}/nota-credito"

    assert api.post(url, json={"concepto": 5}).status_code == 422  # sin monto
    assert api.post(url, json={"concepto": 5, "monto": 99999}).status_code == 422  # más que el saldo
    r = api.post(url, json={"concepto": 5, "monto": 7370}).json()
    assert r["saldo"] == 20000 and r["estado"] == "fiado_abierto"
    assert r["documentos"][-1]["monto"] == 7370 and stock(api, b["id"]) == 8  # no mueve stock

    r = api.post(url, json={"concepto": 5, "monto": 20000}).json()
    assert r["saldo"] == 0 and r["estado"] == "fiado_pagado"

    a = producto(api, "Arroz")
    ve = vender(api, "efectivo", [(a["id"], 1)], facturar=True).json()
    assert api.post(f"/api/ventas/{ve['id']}/nota-credito", json={"concepto": 5, "monto": 100}).status_code == 422


def test_devolucion_en_fiado_baja_el_saldo(api):
    b = producto(api, "Aceite", 11500, iva=19, stock=10)
    c = cliente(api)
    v = vender(api, "fiado", [(b["id"], 2)], cliente_id=c["id"], due_date="2099-12-15").json()
    r = api.post(f"/api/ventas/{v['id']}/nota-credito", json={"concepto": 1, "items": [{"producto_id": b["id"], "cantidad": 1}]}).json()
    assert r["saldo"] == 13685 and stock(api, b["id"]) == 9


# ---- 8. Nota débito ----------------------------------------------------------------------------


def test_nota_debito_en_venta_digital_crea_recaudo_diferencia(api, sesion):
    a = producto(api, precio=10000, stock=20)
    v = vender(api, "digital", [(a["id"], 1)]).json()
    pagar(api, v["reference_code"])
    url = f"/api/ventas/{v['id']}/nota-debito"

    r = api.post(url, json={"concepto": 3, "items": [{"producto_id": a["id"], "cantidad": 2}]})
    assert r.status_code == 200, r.text
    v2 = r.json()
    nd = v2["documentos"][-1]
    assert nd["tipo"] == "nota_debito" and nd["monto"] == 20000 and nd["reference_code"] == f"TFXX-ND-{v['id']:04d}-1"
    dif = v2["recaudos"][-1]
    assert dif["tipo"] == "diferencia" and dif["monto"] == 20000 and dif["estado"] == "ready"
    assert dif["reference_code"] == f"{v['reference_code']}-ND1" and dif["qr"]
    assert v2["saldo"] == 20000  # lo que falta por cobrar de la diferencia
    assert stock(api, a["id"]) == 19 - 2

    pagar(api, dif["reference_code"])
    v3 = api.get(f"/api/ventas/{v['id']}").json()
    assert v3["saldo"] == 0 and v3["recaudos"][-1]["estado"] == "paid"


def test_nota_debito_valida_stock_y_minimo_de_pay(api):
    a = producto(api, precio=10000, stock=3)
    barato = producto(api, "Chicle", 5000, stock=50)
    v = vender(api, "digital", [(a["id"], 1)]).json()
    pagar(api, v["reference_code"])
    url = f"/api/ventas/{v['id']}/nota-debito"

    r = api.post(url, json={"concepto": 3, "items": [{"producto_id": a["id"], "cantidad": 10}]})
    assert r.status_code == 400 and "Stock insuficiente" in r.json()["detail"]
    r = api.post(url, json={"concepto": 3, "items": [{"producto_id": barato["id"], "cantidad": 1}]})
    assert r.status_code == 422 and "$10.000" in r.json()["detail"]
    v = api.get(f"/api/ventas/{v['id']}").json()
    assert len(v["documentos"]) == 1 and len(v["recaudos"]) == 1 and stock(api, barato["id"]) == 50


def test_nota_debito_en_fiado_sube_el_saldo(api):
    a = producto(api, "Arroz", 10000, stock=20)
    c = cliente(api)
    v = vender(api, "fiado", [(a["id"], 1)], cliente_id=c["id"], due_date="2099-12-15").json()
    r = api.post(f"/api/ventas/{v['id']}/nota-debito", json={"concepto": 1, "items": [{"producto_id": a["id"], "cantidad": 1}]}).json()
    assert r["saldo"] == 20000 and r["recaudos"] == [] and stock(api, a["id"]) == 18


# ---- Factura pendiente -------------------------------------------------------------------------


def test_si_factus_falla_la_venta_se_conserva_y_se_puede_reintentar(api, monkeypatch):
    a = producto(api, precio=10000)
    original = fakes.crear_factura

    async def caido(*args, **kwargs):
        raise RuntimeError("Factus no responde")

    monkeypatch.setattr(fakes, "crear_factura", caido)
    v = vender(api, "efectivo", [(a["id"], 1)], facturar=True).json()
    assert v["estado"] == "pagada" and stock(api, a["id"]) == 19  # el cobro no se pierde
    assert v["factura_pendiente"] is True and "Factus no responde" in v["factura_error"] and v["documentos"] == []

    monkeypatch.setattr(fakes, "crear_factura", original)
    v = api.post(f"/api/ventas/{v['id']}/refrescar-pago").json()
    assert v["factura_pendiente"] is False and v["factura_error"] is None
    assert [d["tipo"] for d in v["documentos"]] == ["factura"]


def test_pago_digital_confirmado_con_factus_caido_queda_pendiente(api, monkeypatch):
    a = producto(api, precio=10000)
    v = vender(api, "digital", [(a["id"], 1)]).json()
    original = fakes.crear_factura

    async def caido(*args, **kwargs):
        raise RuntimeError("timeout")

    monkeypatch.setattr(fakes, "crear_factura", caido)
    pagar(api, v["reference_code"])
    v = api.get(f"/api/ventas/{v['id']}").json()
    assert v["estado"] == "pagada" and v["factura_pendiente"] and stock(api, a["id"]) == 19

    monkeypatch.setattr(fakes, "crear_factura", original)
    v = api.post(f"/api/ventas/{v['id']}/refrescar-pago").json()
    assert not v["factura_pendiente"] and len(v["documentos"]) == 1


# ---- 9. Reportes -------------------------------------------------------------------------------


def test_resumen(api):
    a = producto(api, "Arroz", 10000, stock=20)
    escaso = producto(api, "Panela", 3100, stock=2, minimo=6)
    c = cliente(api)
    vender(api, "efectivo", [(a["id"], 1)])  # 10000
    vender(api, "fiado", [(a["id"], 2)], cliente_id=c["id"], due_date="2099-12-15")  # 20000, fiado
    vender(api, "digital", [(a["id"], 1)])  # espera pago: no cuenta
    anulada = vender(api, "efectivo", [(a["id"], 1)], facturar=True).json()
    api.post(f"/api/ventas/{anulada['id']}/nota-credito", json={"concepto": 2})  # anulada: no cuenta

    r = api.get("/api/reportes/resumen").json()
    assert r["ventas_hoy"] == 2 and r["total_hoy"] == 30000 and r["fiado_pendiente"] == 20000
    assert [p["id"] for p in r["productos_bajo_stock"]] == [escaso["id"]]


def test_listado_de_ventas_con_filtros(api):
    a = producto(api)
    c = cliente(api)
    v1 = vender(api, "efectivo", [(a["id"], 1)]).json()
    v2 = vender(api, "fiado", [(a["id"], 1)], cliente_id=c["id"], due_date="2099-12-15").json()
    assert [v["id"] for v in api.get("/api/ventas").json()] == [v2["id"], v1["id"]]  # recientes primero
    assert [v["id"] for v in api.get("/api/ventas?estado=pagada").json()] == [v1["id"]]
    assert [v["id"] for v in api.get("/api/ventas?cliente_id=%d" % c["id"]).json()] == [v2["id"]]
    assert api.get("/api/ventas/999").status_code == 404
