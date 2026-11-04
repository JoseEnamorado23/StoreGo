"""Todas las peticiones a Factus (Pay y Facturación) llevan User-Agent y Accept (Cloudflare bloquea sin UA propio)."""

import asyncio

import httpx

from app.services import _http, factus_facturacion as fact, factus_pay as pay

UA = "TiendaFacil/1.0 (+https://54-209-92-85.sslip.io)"


def test_user_agent_constante():
    assert _http.USER_AGENT == UA


def test_clientes_de_pay_y_facturacion_llevan_las_cabeceras():
    for modulo in (pay, fact):
        assert modulo._http.headers["User-Agent"] == UA
        assert modulo._http.headers["Accept"] == "application/json"


def test_la_peticion_enviada_incluye_user_agent_y_accept():
    vistas: list[httpx.Request] = []

    def servidor(request: httpx.Request) -> httpx.Response:
        vistas.append(request)
        return httpx.Response(200, json={"token": "t"})

    async def ir():
        async with _http.cliente("https://factus.test", transport=httpx.MockTransport(servidor)) as c:
            await c.post("/auth", json={})
            await c.request("GET", "/v1/collections/X", headers={"Authorization": "Bearer t"})

    asyncio.run(ir())
    assert len(vistas) == 2
    for r in vistas:
        assert r.headers["user-agent"] == UA
        assert r.headers["accept"] == "application/json"
