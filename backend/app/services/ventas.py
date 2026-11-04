"""Núcleo de ventas. Las reglas de estado están en docs/API_CONTRACT.md.

Pendiente: Ventas. Las funciones que reciben `db` usan la sesión del request;
`procesar_pago_confirmado` abre su propia sesión porque la llama el webhook
(y el simulador de dev), que no tienen un request autenticado.
"""

from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import Venta
from app.schemas.ventas import AbonoIn, NotaCreditoIn, NotaDebitoIn, ResumenOut, VentaCreate


async def crear_venta(db: Session, datos: VentaCreate) -> Venta:
    """Crea la venta con su reference_code {PREFIJO}-VENTA-NNNN.

    - efectivo: estado "pagada", descuenta stock (y factura si facturar=True).
    - digital: estado "esperando_pago", crea el recaudo (monto entero COP).
    - fiado: estado "fiado_abierto", factura a crédito de inmediato (requiere due_date).
    """
    raise NotImplementedError("Pendiente: Ventas")


async def procesar_pago_confirmado(reference_code: str) -> None:
    """Procesa un recaudo pagado (idempotente: puede llegar repetido por el webhook).

    - tipo venta: marca "pagada", descuenta stock y emite la factura.
    - tipo abono: si los abonos pagados igualan el total, la venta pasa a "fiado_pagado".
    - tipo diferencia: marca el recaudo como pagado.
    """
    raise NotImplementedError("Pendiente: Ventas")


async def refrescar_pago(db: Session, venta_id: int) -> Venta:
    """Consulta Factus Pay por cada recaudo "ready" y procesa los que ya están pagados."""
    raise NotImplementedError("Pendiente: Ventas")


async def crear_abono(db: Session, venta_id: int, datos: AbonoIn) -> Venta:
    """Crea un recaudo tipo abono ({REF}-AB{n}) con su QR para una venta de fiado."""
    raise NotImplementedError("Pendiente: Ventas")


async def crear_nota_credito(db: Session, venta_id: int, datos: NotaCreditoIn) -> Venta:
    """Emite la nota crédito. Concepto 2 deja la venta "anulada" y repone el stock."""
    raise NotImplementedError("Pendiente: Ventas")


async def crear_nota_debito(db: Session, venta_id: int, datos: NotaDebitoIn) -> Venta:
    """Emite la nota débito. Si la venta fue digital crea un recaudo tipo diferencia ({REF}-ND{n})."""
    raise NotImplementedError("Pendiente: Ventas")


def calcular_saldo(db: Session, venta_id: int) -> Decimal:
    """Total de la venta menos los recaudos tipo abono pagados (fiado). 0 si no es fiado."""
    raise NotImplementedError("Pendiente: Ventas")


def resumen(db: Session) -> ResumenOut:
    """Ventas de hoy, total de hoy, fiado pendiente y productos con stock <= stock_minimo."""
    raise NotImplementedError("Pendiente: Ventas")
