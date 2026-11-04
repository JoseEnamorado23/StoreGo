from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.clientes import ClienteOut
from app.schemas.common import Dinero, EstadoVenta, ORMModel, TipoPago
from app.schemas.productos import ProductoOut


class ItemIn(BaseModel):
    producto_id: int
    cantidad: int = Field(gt=0)


class VentaCreate(BaseModel):
    tipo_pago: TipoPago
    cliente_id: int | None = None
    items: list[ItemIn] = Field(min_length=1)
    facturar: bool = False  # solo aplica a efectivo; digital y fiado siempre facturan
    due_date: date | None = None  # obligatorio si es fiado


class AbonoIn(BaseModel):
    # entero COP; el servicio valida los límites de Factus Pay (PAY_MIN_AMOUNT / PAY_MAX_AMOUNT) con mensaje en español
    monto: int = Field(gt=0)


class NotaCreditoIn(BaseModel):
    concepto: Literal[1, 2, 5]
    items: list[ItemIn] | None = None  # concepto 1: items devueltos
    # concepto 5: descuento por pronto pago, entero COP con IVA incluido (se reparte entre las líneas de la factura)
    monto: int | None = Field(default=None, gt=0)
    observacion: str | None = None


class NotaDebitoIn(BaseModel):
    concepto: Literal[1, 3, 4]
    items: list[ItemIn] = Field(min_length=1)
    observacion: str | None = None


class VentaItemOut(ORMModel):
    id: int
    producto_id: int
    nombre: str
    cantidad: int
    precio: Dinero
    iva: int


class RecaudoOut(ORMModel):
    id: int
    reference_code: str
    tipo: Literal["venta", "abono", "diferencia"]
    monto: int
    estado: Literal["ready", "paid", "expired"]
    breb_key: str | None = None
    qr: str | None = None
    qr_expires_at: datetime | None = None
    collected_at: datetime | None = None


class DocumentoVentaOut(ORMModel):
    id: int
    tipo: Literal["factura", "nota_credito", "nota_debito"]
    reference_code: str
    numero: str | None = None
    cufe: str | None = None
    is_validated: bool
    public_url: str | None = None
    factura_origen_id: int | None = None
    errores: dict | list | None = None  # avisos de la DIAN: dict en facturas, lista en notas
    monto: Dinero = 0  # valor con IVA del documento


class VentaResumen(ORMModel):
    id: int
    reference_code: str
    tipo_pago: TipoPago
    estado: EstadoVenta
    total: Dinero
    cliente_id: int | None = None
    due_date: date | None = None
    created_at: datetime


class VentaDetalle(VentaResumen):
    saldo: Dinero
    # Si Factus falló al facturar una venta ya cobrada: true + mensaje legible; se reintenta con refrescar-pago
    factura_pendiente: bool = False
    factura_error: str | None = None
    # COP que el tendero debe devolver a mano (Factus Pay no hace reversos); null si no aplica
    devolver_manual: int | None = None
    cliente: ClienteOut | None = None
    items: list[VentaItemOut]
    recaudos: list[RecaudoOut]
    documentos: list[DocumentoVentaOut]


class ResumenOut(BaseModel):
    ventas_hoy: int
    total_hoy: Dinero
    fiado_pendiente: Dinero
    productos_bajo_stock: list[ProductoOut]
