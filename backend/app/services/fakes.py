"""Implementación falsa de Factus Pay y Facturación (FACTUS_MODE=fake).

Misma interfaz que factus_pay.py y factus_facturacion.py, sin red.
"""

import hmac
import itertools

from fastapi import HTTPException

from app.config import settings
from app.schemas.factus import (
    ClienteFactura,
    DocumentoOut,
    ItemFactura,
    PagoFactura,
    RecaudoOut,
)

# PNG de 1 píxel
_QR_FALSO = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)

# reference_code de los recaudos "pagados" (los marca /api/dev/simular-pago)
PAGADOS: set[str] = set()

_recaudos: dict[str, RecaudoOut] = {}
_documentos: dict[str, DocumentoOut] = {}
_consecutivos = {
    "factura": itertools.count(1),
    "nota_credito": itertools.count(1),
    "nota_debito": itertools.count(1),
}
_prefijos = {"factura": "FAKE", "nota_credito": "FAKE-NC", "nota_debito": "FAKE-ND"}


# ---- Factus Pay -------------------------------------------------------------


def _estado(reference_code: str) -> str:
    return "paid" if reference_code in PAGADOS else "ready"


async def crear_recaudo(reference_code: str, amount: int, expiration: int = 86400) -> RecaudoOut:
    if not settings.pay_min_amount <= amount <= settings.pay_max_amount:
        raise HTTPException(
            status_code=422,
            detail=f"El monto debe estar entre {settings.pay_min_amount} y {settings.pay_max_amount} COP",
        )
    existente = _recaudos.get(reference_code)
    if existente is None:
        existente = RecaudoOut(
            reference_code=reference_code,
            amount=amount,
            status="ready",
            breb_key="@FAKE123",
            qr=_QR_FALSO,
            qr_expires_at=None,
            collected_at=None,
        )
        _recaudos[reference_code] = existente
    return existente.model_copy(update={"status": _estado(reference_code)})


async def obtener_recaudo(reference_code: str) -> RecaudoOut:
    base = _recaudos.get(reference_code)
    if base is None:
        # Recaudo no creado por este proceso (p. ej. tras reiniciar): se reconstruye mínimo
        base = RecaudoOut(reference_code=reference_code, amount=0, status="ready", breb_key="@FAKE123", qr=_QR_FALSO)
    return base.model_copy(update={"status": _estado(reference_code)})


def webhook_key_valida(key: str) -> bool:
    return hmac.compare_digest(key.encode(), settings.factus_pay_webhook_key.encode())


# ---- Factus Facturación -----------------------------------------------------


async def listar_rangos() -> list[dict]:
    return [{"id": 1, "document": "Factura de Venta", "prefix": "FAKE", "is_active": 1}]


def _documento(tipo: str, reference_code: str) -> DocumentoOut:
    # Reenviar un reference_code ya procesado devuelve el documento existente (como Factus)
    if reference_code in _documentos:
        return _documentos[reference_code]
    n = next(_consecutivos[tipo])
    doc = DocumentoOut(
        tipo=tipo,
        reference_code=reference_code,
        numero=f"{_prefijos[tipo]}-{n:04d}",
        cufe=f"fake-cufe-{reference_code.lower()}",
        is_validated=True,
        public_url=f"https://factus.invalid/fake/{reference_code}",
        qr_url=None,
        errores=None,
    )
    _documentos[reference_code] = doc
    return doc


async def crear_factura(
    reference_code: str,
    items: list[ItemFactura],
    pago: PagoFactura,
    cliente: ClienteFactura | None = None,
) -> DocumentoOut:
    return _documento("factura", reference_code)


async def crear_nota_credito(
    reference_code: str,
    factura_numero: str,
    concepto: int,
    items: list[ItemFactura],
    pago: PagoFactura,
    cliente: ClienteFactura | None = None,
) -> DocumentoOut:
    return _documento("nota_credito", reference_code)


async def crear_nota_debito(
    reference_code: str,
    factura_numero: str,
    concepto: int,
    items: list[ItemFactura],
    pago: PagoFactura,
    cliente: ClienteFactura | None = None,
) -> DocumentoOut:
    return _documento("nota_debito", reference_code)
