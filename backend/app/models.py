from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Producto(Base):
    __tablename__ = "productos"

    id: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[str | None] = mapped_column(String(50), nullable=True)
    nombre: Mapped[str] = mapped_column(String(200))
    precio: Mapped[Decimal] = mapped_column(Numeric(12, 2))  # sin IVA
    iva: Mapped[int] = mapped_column(Integer, default=0)  # 0 o 19
    stock: Mapped[int] = mapped_column(Integer, default=0)
    stock_minimo: Mapped[int] = mapped_column(Integer, default=0)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class Cliente(Base):
    __tablename__ = "clientes"

    id: Mapped[int] = mapped_column(primary_key=True)
    tipo_documento: Mapped[str] = mapped_column(String(5))  # "13" CC, "31" NIT...
    documento: Mapped[str] = mapped_column(String(30))
    nombres: Mapped[str] = mapped_column(String(200))
    telefono: Mapped[str | None] = mapped_column(String(30), nullable=True)
    email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    direccion: Mapped[str | None] = mapped_column(String(300), nullable=True)


class Venta(Base):
    __tablename__ = "ventas"

    id: Mapped[int] = mapped_column(primary_key=True)
    reference_code: Mapped[str] = mapped_column(String(80), unique=True)
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("clientes.id"), nullable=True)
    tipo_pago: Mapped[str] = mapped_column(String(20))  # efectivo|digital|fiado
    # esperando_pago|pagada|fiado_abierto|fiado_pagado|anulada
    estado: Mapped[str] = mapped_column(String(20))
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2))  # con IVA
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)  # solo fiado
    # Si Factus falla al facturar una venta ya cobrada, la venta se conserva y se marca para reintentar
    factura_pendiente: Mapped[bool] = mapped_column(Boolean, default=False)
    factura_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now()
    )

    cliente: Mapped[Cliente | None] = relationship()
    items: Mapped[list["VentaItem"]] = relationship(back_populates="venta", order_by="VentaItem.id")
    recaudos: Mapped[list["Recaudo"]] = relationship(back_populates="venta", order_by="Recaudo.id")
    documentos: Mapped[list["DocumentoElectronico"]] = relationship(
        back_populates="venta", foreign_keys="DocumentoElectronico.venta_id", order_by="DocumentoElectronico.id"
    )


class VentaItem(Base):
    __tablename__ = "venta_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    venta_id: Mapped[int] = mapped_column(ForeignKey("ventas.id"))
    producto_id: Mapped[int] = mapped_column(ForeignKey("productos.id"))
    nombre: Mapped[str] = mapped_column(String(200))
    cantidad: Mapped[int] = mapped_column(Integer)
    precio: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    iva: Mapped[int] = mapped_column(Integer, default=0)

    venta: Mapped[Venta] = relationship(back_populates="items")


class Recaudo(Base):
    __tablename__ = "recaudos"

    id: Mapped[int] = mapped_column(primary_key=True)
    venta_id: Mapped[int] = mapped_column(ForeignKey("ventas.id"))
    reference_code: Mapped[str] = mapped_column(String(80), unique=True)
    tipo: Mapped[str] = mapped_column(String(20))  # venta|abono|diferencia
    monto: Mapped[int] = mapped_column(Integer)  # entero COP
    estado: Mapped[str] = mapped_column(String(20))  # ready|paid|expired
    breb_key: Mapped[str | None] = mapped_column(String(100), nullable=True)
    qr: Mapped[str | None] = mapped_column(Text, nullable=True)  # base64
    qr_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    collected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    venta: Mapped[Venta] = relationship(back_populates="recaudos")


class DocumentoElectronico(Base):
    __tablename__ = "documentos_electronicos"

    id: Mapped[int] = mapped_column(primary_key=True)
    venta_id: Mapped[int] = mapped_column(ForeignKey("ventas.id"))
    tipo: Mapped[str] = mapped_column(String(20))  # factura|nota_credito|nota_debito
    reference_code: Mapped[str] = mapped_column(String(80))
    numero: Mapped[str | None] = mapped_column(String(50), nullable=True)
    cufe: Mapped[str | None] = mapped_column(String(200), nullable=True)
    is_validated: Mapped[bool] = mapped_column(Boolean, default=False)
    public_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    factura_origen_id: Mapped[int | None] = mapped_column(
        ForeignKey("documentos_electronicos.id"), nullable=True
    )
    errores: Mapped[dict | list | None] = mapped_column(JSON, nullable=True)
    # Valor con IVA del documento; sirve para el saldo de los fiados y para las devoluciones
    monto: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)

    venta: Mapped[Venta] = relationship(back_populates="documentos", foreign_keys=[venta_id])


class MovimientoInventario(Base):
    __tablename__ = "movimientos_inventario"

    id: Mapped[int] = mapped_column(primary_key=True)
    producto_id: Mapped[int] = mapped_column(ForeignKey("productos.id"))
    venta_id: Mapped[int | None] = mapped_column(ForeignKey("ventas.id"), nullable=True)
    tipo: Mapped[str] = mapped_column(String(20))  # venta|devolucion|entrada|ajuste
    cantidad: Mapped[int] = mapped_column(Integer)  # con signo: venta -n, devolucion +n, entrada +n
    nota: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now()
    )


class WebhookEvento(Base):
    __tablename__ = "webhook_eventos"

    id: Mapped[int] = mapped_column(primary_key=True)
    reference_code: Mapped[str] = mapped_column(String(80))
    payload: Mapped[dict] = mapped_column(JSON)
    procesado_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
