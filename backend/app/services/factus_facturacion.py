"""Cliente real de Factus Facturación (factura, nota crédito y nota débito).

Pendiente: Facturación. Ver hechos verificados en AGENTS.md.
"""

from app.schemas.factus import (
    ClienteFactura,
    DocumentoOut,
    ItemFactura,
    PagoFactura,
)


async def listar_rangos() -> list[dict]:
    """GET /v2/numbering-ranges?filter[is_active]=1."""
    raise NotImplementedError("Pendiente: Facturación")


async def crear_factura(
    reference_code: str,
    items: list[ItemFactura],
    pago: PagoFactura,
    cliente: ClienteFactura | None = None,
) -> DocumentoOut:
    """POST /v2/bills/validate. cliente=None significa consumidor final.

    Ante 409 (pendiente ante la DIAN): borrar por reference_code y reenviar.
    """
    raise NotImplementedError("Pendiente: Facturación")


async def crear_nota_credito(
    reference_code: str,
    factura_numero: str,
    concepto: int,
    items: list[ItemFactura],
    pago: PagoFactura | None = None,
    cliente: ClienteFactura | None = None,
) -> DocumentoOut:
    """POST /v2/credit-notes/validate (customization_id "20", bill_number=factura_numero).

    concepto: 1 devolución parcial, 2 anulación, 5 descuento por pronto pago.
    """
    raise NotImplementedError("Pendiente: Facturación")


async def crear_nota_debito(
    reference_code: str,
    factura_numero: str,
    concepto: int,
    items: list[ItemFactura],
    pago: PagoFactura,
) -> DocumentoOut:
    """POST /v2/debit-notes/validate (customization_id "30", bill_number=factura_numero).

    concepto: 1 intereses, 2 gastos, 3 cambio del valor, 4 otros.
    """
    raise NotImplementedError("Pendiente: Facturación")
