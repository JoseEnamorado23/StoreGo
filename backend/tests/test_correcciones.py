import asyncio

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.config import settings
from app.schemas.factus import DocumentoOut
from app.schemas.ventas import AbonoIn
from app.services import factus_facturacion as fact
from app.services import fakes


def test_limites_de_pay_por_defecto():
    assert (settings.pay_min_amount, settings.pay_max_amount) == (10_000, 12_000_000)


def test_abono_exige_monto_positivo():
    AbonoIn(monto=10_000)
    with pytest.raises(ValidationError):
        AbonoIn(monto=0)  # los límites de Pay los valida el servicio, con mensaje en español


def test_fake_recaudo_respeta_limites():
    for malo in (5_000, 12_000_001):
        with pytest.raises(HTTPException) as e:
            asyncio.run(fakes.crear_recaudo("TFXX-VENTA-9100", malo))
        assert e.value.status_code == 422


def test_documento_errores_dict_lista_o_none():
    base = {"tipo": "factura", "reference_code": "X"}
    assert DocumentoOut(**base, errores={"RUT01": "aviso"}).errores == {"RUT01": "aviso"}
    assert DocumentoOut(**base, errores=["Regla: CBF02"]).errores == ["Regla: CBF02"]
    assert DocumentoOut(**base, errores=None).errores is None


def test_cude_se_mapea_a_cufe():
    nota = DocumentoOut(tipo="nota_credito", reference_code="X", cude="abc123")
    assert nota.cufe == "abc123"
    factura = DocumentoOut(tipo="factura", reference_code="X", cufe="def456")
    assert factura.cufe == "def456"


RANGOS = [
    {"id": 1, "document": "Nota Crédito", "is_active": True, "is_expired": True, "to": None, "current": 5},
    {"id": 2, "document": "Nota Crédito", "is_active": True, "is_expired": False, "to": 10, "current": 10},
    {"id": 3, "document": "Nota Crédito", "is_active": True, "is_expired": False, "to": None, "current": 5},
    {"id": 4, "document": "Factura de Venta", "is_active": True, "is_expired": False, "to": 100, "current": 7},
]


def test_rango_elige_activo_no_vencido_y_con_consecutivos(monkeypatch):
    async def falsos():
        return RANGOS

    monkeypatch.setattr(fact, "listar_rangos", falsos)
    assert asyncio.run(fact.rango_para("nota_credito")) == 3
    assert asyncio.run(fact.rango_para("factura")) == 4
    with pytest.raises(HTTPException):
        asyncio.run(fact.rango_para("nota_debito"))


def test_rango_forzado_por_env(monkeypatch):
    monkeypatch.setattr(settings, "factus_rango_nc", 390)
    assert asyncio.run(fact.rango_para("nota_credito")) == 390
