import asyncio
import os

from fastapi.testclient import TestClient

from app.main import app
from app.schemas.factus import PagoFactura
from app.services import facturacion, pay

client = TestClient(app)


def _token() -> str:
    r = client.post(
        "/api/auth/login",
        json={"email": os.environ["APP_ADMIN_EMAIL"], "password": os.environ["APP_ADMIN_PASSWORD"]},
    )
    assert r.status_code == 200
    return r.json()["token"]


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "factus_mode": "fake"}


def test_login_incorrecto():
    r = client.post("/api/auth/login", json={"email": "x@x.com", "password": "mal"})
    assert r.status_code == 401


def test_endpoints_exigen_token():
    assert client.get("/api/productos").status_code == 401


def test_pendiente_con_token():
    r = client.get("/api/productos", headers={"Authorization": f"Bearer {_token()}"})
    assert r.status_code == 501
    assert r.json()["detail"] == "Pendiente: inventario"


def test_fake_recaudo_y_factura():
    async def flujo():
        rec = await pay.crear_recaudo("TFXX-VENTA-9001", 5000)
        assert rec.status == "ready" and rec.breb_key == "@FAKE123"
        doc = await facturacion.crear_factura(
            "TFXX-VENTA-9001", [], PagoFactura(forma="contado", metodo_codigo="10", monto=5000)
        )
        assert doc.numero.startswith("FAKE-") and doc.is_validated
        repetido = await facturacion.crear_factura(
            "TFXX-VENTA-9001", [], PagoFactura(forma="contado", metodo_codigo="10", monto=5000)
        )
        assert repetido.numero == doc.numero

    asyncio.run(flujo())


def test_webhook_key():
    assert pay.webhook_key_valida(os.environ["FACTUS_PAY_WEBHOOK_KEY"])
    assert not pay.webhook_key_valida("otra")
