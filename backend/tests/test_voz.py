"""Pruebas de POST /api/voz/interpretar con el modelo simulado (no se llama a ningún proveedor real)."""

import asyncio
import json
import logging
from decimal import Decimal

import httpx
import pytest

from app.config import settings
from app.models import Cliente, Producto
from app.services import voz
from app.services.seed import sembrar_productos


@pytest.fixture(autouse=True)
def ia_activa(monkeypatch):
    """Por defecto VOZ_USAR_IA es false; estas pruebas ejercitan el camino con el modelo (simulado)."""
    monkeypatch.setattr(settings, "voz_usar_ia", True)


@pytest.fixture
def catalogo(sesion):
    """15 productos del seed + dos Coca-Cola, y tres clientes."""
    with sesion() as db:
        sembrar_productos(db)
        db.add(Producto(codigo="P100", nombre="Coca-Cola 1 L", precio=Decimal(4500), iva=19, stock=20, stock_minimo=5))
        db.add(Producto(codigo="P101", nombre="Coca-Cola 2,5 L", precio=Decimal(9000), iva=19, stock=20, stock_minimo=5))
        db.add(Cliente(tipo_documento="13", documento="100", nombres="Marta Rodríguez"))
        db.add(Cliente(tipo_documento="13", documento="200", nombres="Pedro Pérez"))
        db.add(Cliente(tipo_documento="13", documento="300", nombres="Luz Dary Cortés"))
        db.commit()
    return sesion


def modelo(monkeypatch, items, cliente=None, tipo_pago=None):
    """Simula la respuesta del LLM."""

    async def falso(texto):
        return {"items": items, "cliente": cliente, "tipo_pago": tipo_pago}

    monkeypatch.setattr(voz, "extraer_con_modelo", falso)


def modelo_falla(monkeypatch, error=None):
    async def falso(texto):
        raise error or httpx.ConnectError("sin red")

    monkeypatch.setattr(voz, "extraer_con_modelo", falso)


def interpretar(api, texto):
    r = api.post("/api/voz/interpretar", json={"texto": texto})
    assert r.status_code == 200, r.text
    return r.json()


def por_nombre(resp):
    return {i["nombre"]: i["cantidad"] for i in resp["items"]}


# ---------------------------------------------------------------- frases reales con el modelo simulado

def test_frase_completa_con_cliente_fiado(api, catalogo, monkeypatch):
    modelo(
        monkeypatch,
        [{"nombre": "arroz", "cantidad": "dos"}, {"nombre": "coca cola de litro", "cantidad": "una"},
         {"nombre": "huevos", "cantidad": "tres"}],
        cliente="doña Marta",
        tipo_pago="fiado",
    )
    r = interpretar(api, "dos arroz, una coca cola de litro y tres huevos para doña Marta, fiado")
    assert por_nombre(r) == {"Arroz Diana 500 g": 2, "Coca-Cola 1 L": 1, "Huevos AA x12": 3}
    assert r["cliente"]["nombres"] == "Marta Rodríguez"
    assert r["tipo_pago"] == "fiado"
    assert r["no_reconocidos"] == []
    assert r["advertencia"] is None
    assert all(0.7 <= i["confianza"] <= 1 for i in r["items"])


def test_error_de_escritura_cocacola(api, catalogo, monkeypatch):
    modelo(monkeypatch, [{"nombre": "cocacola", "cantidad": "una"}])
    r = interpretar(api, "una cocacola")
    assert len(r["items"]) == 1
    assert r["items"][0]["nombre"].startswith("Coca-Cola")


def test_error_de_escritura_huebos_y_media_docena(api, catalogo, monkeypatch):
    modelo(monkeypatch, [{"nombre": "huebos", "cantidad": "media docena"}])
    r = interpretar(api, "media docena de huebos")
    assert por_nombre(r) == {"Huevos AA x12": 6}


def test_plurales_y_tildes(api, catalogo, monkeypatch):
    modelo(monkeypatch, [{"nombre": "Leches", "cantidad": "tres"}, {"nombre": "PAN", "cantidad": "un"},
                         {"nombre": "azúcar", "cantidad": "2"}])
    r = interpretar(api, "tres leches, un pan y 2 azúcar")
    assert por_nombre(r) == {"Leche Alquería 1 L": 3, "Pan tajado Bimbo": 1, "Azúcar Manuelita 1 kg": 2}


def test_un_par_y_marca_incompleta(api, catalogo, monkeypatch):
    modelo(monkeypatch, [{"nombre": "panelas", "cantidad": "un par"}, {"nombre": "cafe sello rojo", "cantidad": None}])
    r = interpretar(api, "un par de panelas y café sello rojo")
    assert por_nombre(r) == {"Panela cuadrada": 2, "Café Sello Rojo 250 g": 1}


def test_pago_digital(api, catalogo, monkeypatch):
    modelo(monkeypatch, [{"nombre": "cervezas aguila", "cantidad": "cinco"}], tipo_pago="digital")
    r = interpretar(api, "cinco cervezas águila por QR")
    assert por_nombre(r) == {"Cerveza Águila lata": 5}
    assert r["tipo_pago"] == "digital"
    assert r["cliente"] is None


def test_pago_efectivo_y_unidad_en_el_nombre(api, catalogo, monkeypatch):
    modelo(monkeypatch, [{"nombre": "aceite", "cantidad": "dos"}, {"nombre": "gaseosa postobon", "cantidad": ""}],
           tipo_pago="efectivo")
    r = interpretar(api, "dos aceites y una gaseosa postobón de contado")
    assert por_nombre(r) == {"Aceite Premier 1 L": 2, "Gaseosa Postobón 1,5 L": 1}
    assert r["tipo_pago"] == "efectivo"


def test_sin_cantidad_es_uno(api, catalogo, monkeypatch):
    modelo(monkeypatch, [{"nombre": "atun", "cantidad": None}, {"nombre": "lentejas", "cantidad": ""}])
    r = interpretar(api, "atún y lentejas")
    assert por_nombre(r) == {"Atún Van Camps lata": 1, "Lentejas Roa 500 g": 1}


def test_cantidad_numerica_del_modelo(api, catalogo, monkeypatch):
    modelo(monkeypatch, [{"nombre": "papas", "cantidad": 4}, {"nombre": "jabon", "cantidad": 2.0}])
    r = interpretar(api, "cuatro papas y dos jabones")
    assert por_nombre(r) == {"Papas Margarita pollo": 4, "Jabón Rey barra": 2}


def test_mismo_producto_dos_veces_se_suma(api, catalogo, monkeypatch):
    modelo(monkeypatch, [{"nombre": "arroz", "cantidad": "dos"}, {"nombre": "arroces", "cantidad": "tres"}])
    r = interpretar(api, "dos arroz y tres arroces")
    assert por_nombre(r) == {"Arroz Diana 500 g": 5}


def test_mezcla_conocidos_y_desconocidos(api, catalogo, monkeypatch):
    modelo(monkeypatch, [{"nombre": "detergente", "cantidad": "uno"}, {"nombre": "pilas duracell", "cantidad": "dos"}])
    r = interpretar(api, "un detergente y dos pilas duracell")
    assert por_nombre(r) == {"Detergente Fab 1 kg": 1}
    assert r["no_reconocidos"] == ["pilas duracell"]


def test_frase_sin_productos_conocidos(api, catalogo, monkeypatch):
    modelo(monkeypatch, [{"nombre": "pilas duracell", "cantidad": "dos"}, {"nombre": "cargador de celular", "cantidad": "un"},
                         {"nombre": "zapatos", "cantidad": None}])
    r = interpretar(api, "dos pilas duracell, un cargador de celular y zapatos")
    assert r["items"] == []
    assert r["no_reconocidos"] == ["pilas duracell", "cargador de celular", "zapatos"]


def test_el_modelo_no_inventa_productos_que_no_existen(api, catalogo, monkeypatch):
    # Aunque el modelo "devuelva" un producto, solo vale lo que existe en la tabla
    modelo(monkeypatch, [{"nombre": "televisor samsung 50 pulgadas", "cantidad": "1"}])
    r = interpretar(api, "un televisor")
    assert r["items"] == [] and r["no_reconocidos"] == ["televisor samsung 50 pulgadas"]


# ---------------------------------------------------------------- clientes

def test_cliente_desconocido_con_fiado_avisa(api, catalogo, monkeypatch):
    modelo(monkeypatch, [{"nombre": "leche", "cantidad": "una"}], cliente="doña Pepita", tipo_pago="fiado")
    r = interpretar(api, "una leche fiado a doña Pepita")
    assert r["cliente"] is None
    assert "cliente: doña Pepita" in r["no_reconocidos"]
    assert r["tipo_pago"] == "fiado"
    assert "fiada sin cliente" in r["advertencia"]


def test_varios_clientes_parecidos_confianza_baja(api, catalogo, monkeypatch):
    with catalogo() as db:
        db.add(Cliente(tipo_documento="13", documento="400", nombres="Marta Gómez"))
        db.commit()
    modelo(monkeypatch, [{"nombre": "pan", "cantidad": "uno"}], cliente="Marta", tipo_pago="fiado")
    r = interpretar(api, "un pan para Marta fiado")
    assert r["cliente"]["nombres"] in ("Marta Rodríguez", "Marta Gómez")
    assert r["cliente"]["confianza"] <= 0.5


def test_cliente_con_apellido_distingue(api, catalogo, monkeypatch):
    with catalogo() as db:
        db.add(Cliente(tipo_documento="13", documento="400", nombres="Marta Gómez"))
        db.commit()
    modelo(monkeypatch, [{"nombre": "pan", "cantidad": "uno"}], cliente="don Pedro Perez", tipo_pago="fiado")
    r = interpretar(api, "un pan para don Pedro Perez fiado")
    assert r["cliente"]["nombres"] == "Pedro Pérez"
    assert r["cliente"]["confianza"] > 0.9


# ---------------------------------------------------------------- respaldo sin modelo

def test_respaldo_cuando_el_proveedor_falla(api, catalogo, monkeypatch):
    modelo_falla(monkeypatch)
    r = interpretar(api, "dos arroz, una coca cola de litro y tres huevos para doña Marta, fiado")
    assert por_nombre(r) == {"Arroz Diana 500 g": 2, "Coca-Cola 1 L": 1, "Huevos AA x12": 3}
    assert r["cliente"]["nombres"] == "Marta Rodríguez"
    assert r["tipo_pago"] == "fiado"
    assert r["no_reconocidos"] == []
    assert "reglas" in r["advertencia"]


def test_respaldo_pagos_y_cantidades(api, catalogo, monkeypatch):
    modelo_falla(monkeypatch)
    r = interpretar(api, "media docena de huevos y 3 leches por nequi")
    assert por_nombre(r) == {"Huevos AA x12": 6, "Leche Alquería 1 L": 3}
    assert r["tipo_pago"] == "digital"
    assert r["advertencia"]
    r = interpretar(api, "dos panelas de contado")
    assert r["tipo_pago"] == "efectivo" and por_nombre(r) == {"Panela cuadrada": 2}
    r = interpretar(api, "un pan por transferencia")
    assert r["tipo_pago"] == "digital"
    r = interpretar(api, "cuatro gaseosas por QR")
    assert r["tipo_pago"] == "digital" and por_nombre(r) == {"Gaseosa Postobón 1,5 L": 4}


def test_respaldo_con_no_reconocidos(api, catalogo, monkeypatch):
    modelo_falla(monkeypatch)
    r = interpretar(api, "una leche y dos pilas")
    assert por_nombre(r) == {"Leche Alquería 1 L": 1}
    assert r["no_reconocidos"] == ["pilas"]


def test_respaldo_por_tiempo_agotado(api, catalogo, monkeypatch):
    async def lento(texto):
        await asyncio.sleep(5)
        return {"items": []}

    monkeypatch.setattr(voz, "extraer_con_modelo", lento)
    monkeypatch.setattr(voz, "LLM_TIMEOUT", 0.05)
    r = interpretar(api, "dos arroz fiado")
    assert por_nombre(r) == {"Arroz Diana 500 g": 2}
    assert r["tipo_pago"] == "fiado"
    assert r["advertencia"]


def test_respaldo_si_el_modelo_devuelve_basura(api, catalogo, monkeypatch):
    async def basura(texto):
        return {"algo": "raro"}

    monkeypatch.setattr(voz, "extraer_con_modelo", basura)
    r = interpretar(api, "tres huevos")
    assert por_nombre(r) == {"Huevos AA x12": 3}
    assert r["advertencia"]


def test_respaldo_sin_llave(api, catalogo, monkeypatch):
    monkeypatch.setattr(settings, "llm_api_key", "")
    r = interpretar(api, "un atún")
    assert por_nombre(r) == {"Atún Van Camps lata": 1}
    assert r["advertencia"]


def test_respaldo_proveedor_no_soportado(api, catalogo, monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "otro")
    monkeypatch.setattr(settings, "llm_api_key", "x")
    assert interpretar(api, "un atún")["advertencia"]


# ---------------------------------------------------------------- validación y seguridad

def test_texto_vacio_o_enorme(api, catalogo):
    assert api.post("/api/voz/interpretar", json={"texto": "   "}).status_code == 422
    assert api.post("/api/voz/interpretar", json={"texto": "a" * 1001}).status_code == 422


def test_requiere_login(catalogo):
    from fastapi.testclient import TestClient
    from app.main import app

    assert TestClient(app).post("/api/voz/interpretar", json={"texto": "un pan"}).status_code in (401, 403)


def test_la_llave_va_en_cabecera_y_no_se_registra(api, catalogo, monkeypatch, caplog):
    llave = "LLAVE-SECRETA-123"
    monkeypatch.setattr(settings, "llm_api_key", llave)
    monkeypatch.setattr(settings, "llm_model", "gemini-prueba")
    vistas = []

    def responder(request: httpx.Request) -> httpx.Response:
        vistas.append(request)
        if len(vistas) == 1:
            cuerpo = {"candidates": [{"content": {"parts": [{"text": json.dumps(
                {"items": [{"nombre": "arroz", "cantidad": "dos"}], "cliente": None, "tipo_pago": None})}]}}]}
            return httpx.Response(200, json=cuerpo)
        return httpx.Response(429, json={"error": {"message": "cuota"}})

    real = httpx.AsyncClient
    monkeypatch.setattr(voz.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(responder), **kw))

    caplog.set_level(logging.DEBUG)
    r = interpretar(api, "dos arroz")
    assert por_nombre(r) == {"Arroz Diana 500 g": 2} and r["advertencia"] is None
    req = vistas[0]
    assert llave not in str(req.url) and req.headers["x-goog-api-key"] == llave
    assert "gemini-prueba:generateContent" in str(req.url)
    cuerpo = json.loads(req.content)
    assert cuerpo["generationConfig"]["temperature"] <= 0.2
    assert cuerpo["generationConfig"]["responseMimeType"] == "application/json"
    assert "responseSchema" in cuerpo["generationConfig"]

    # Segunda llamada: el proveedor responde 429 -> respaldo, y la llave no aparece en los logs
    r = interpretar(api, "dos arroz")
    assert r["advertencia"]
    assert llave not in caplog.text


# ---------------------------------------------------------------- cantidades

@pytest.mark.parametrize("dicho,esperado", [
    ("dos", 2), ("una", 1), ("un", 1), ("tres", 3), ("media docena", 6), ("una docena", 12), ("docena", 12),
    ("dos docenas", 24), ("un par", 2), ("par", 2), ("12", 12), ("quince", 15), ("", 1), (None, 1), (3, 3),
    (0, 1), (2.0, 2), ("algo raro", 1), ("tres de", 3),
])
def test_parse_cantidad(dicho, esperado):
    assert voz.parse_cantidad(dicho) == esperado


def test_ia_desactivada_usa_reglas_sin_llamar_al_modelo(api, catalogo, monkeypatch):
    monkeypatch.setattr(settings, "voz_usar_ia", False)

    async def no_debe_llamarse(texto):
        raise AssertionError("no debe llamar al modelo")

    monkeypatch.setattr(voz, "extraer_con_modelo", no_debe_llamarse)
    r = interpretar(api, "tres huevos y una leche para doña Marta, fiado")
    assert por_nombre(r) == {"Huevos AA x12": 3, "Leche Alquería 1 L": 1}
    assert r["cliente"]["nombres"] == "Marta Rodríguez" and r["tipo_pago"] == "fiado"
    assert "IA desactivada" in r["advertencia"]


def _transporte_groq(monkeypatch, responder):
    real = httpx.AsyncClient
    monkeypatch.setattr(voz.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(responder), **kw))


def test_groq_peticion_respuesta_y_modelo_por_defecto(api, catalogo, monkeypatch, caplog):
    llave = "GSK-SECRETA-456"
    monkeypatch.setattr(settings, "llm_provider", "groq")
    monkeypatch.setattr(settings, "llm_api_key", llave)
    monkeypatch.setattr(settings, "llm_model", "")
    vistas = []

    def responder(request):
        vistas.append(request)
        if len(vistas) == 1:
            contenido = json.dumps({"items": [{"nombre": "huebos", "cantidad": "media docena"}],
                                    "cliente": "Marta", "tipo_pago": "fiado"})
            return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": contenido}}]})
        return httpx.Response(401, json={"error": {"message": "invalid api key"}})

    _transporte_groq(monkeypatch, responder)
    caplog.set_level(logging.DEBUG)
    r = interpretar(api, "media docena de huebos para Marta fiado")
    assert por_nombre(r) == {"Huevos AA x12": 6} and r["tipo_pago"] == "fiado"
    assert r["cliente"]["nombres"] == "Marta Rodríguez" and r["advertencia"] is None
    req = vistas[0]
    assert str(req.url) == "https://api.groq.com/openai/v1/chat/completions"
    assert req.headers["authorization"] == f"Bearer {llave}" and llave not in str(req.url)
    cuerpo = json.loads(req.content)
    assert cuerpo["model"] == "openai/gpt-oss-20b"
    assert cuerpo["temperature"] <= 0.2 and cuerpo["response_format"] == {"type": "json_object"}
    assert "JSON" in cuerpo["messages"][0]["content"]
    assert llave not in req.content.decode()

    r = interpretar(api, "dos arroz")  # 401 del proveedor -> respaldo por reglas
    assert por_nombre(r) == {"Arroz Diana 500 g": 2} and r["advertencia"]
    assert llave not in caplog.text


def test_groq_modelo_configurado_y_json_invalido(api, catalogo, monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "groq")
    monkeypatch.setattr(settings, "llm_api_key", "x")
    monkeypatch.setattr(settings, "llm_model", "llama-otro")
    modelos = []

    def responder(request):
        modelos.append(json.loads(request.content)["model"])
        return httpx.Response(200, json={"choices": [{"message": {"content": "no es json"}}]})

    _transporte_groq(monkeypatch, responder)
    r = interpretar(api, "tres huevos")
    assert modelos == ["llama-otro"]
    assert por_nombre(r) == {"Huevos AA x12": 3} and r["advertencia"]


def test_groq_tiempo_agotado_usa_respaldo(api, catalogo, monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "groq")
    monkeypatch.setattr(settings, "llm_api_key", "x")

    def responder(request):
        raise httpx.ReadTimeout("lento", request=request)

    _transporte_groq(monkeypatch, responder)
    r = interpretar(api, "un atún")
    assert por_nombre(r) == {"Atún Van Camps lata": 1} and r["advertencia"]
