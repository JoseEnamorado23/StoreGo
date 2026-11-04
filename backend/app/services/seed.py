"""Datos de ejemplo para desarrollo (APP_ENV=dev). Idempotente: se identifica cada producto por su código."""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import MovimientoInventario, Producto

# (codigo, nombre, precio sin IVA, iva, stock, stock_minimo)
PRODUCTOS = [
    ("P001", "Arroz Diana 500 g", 2400, 0, 40, 10),
    ("P002", "Leche Alquería 1 L", 4200, 0, 24, 8),
    ("P003", "Huevos AA x12", 9800, 0, 15, 5),
    ("P004", "Aceite Premier 1 L", 11500, 19, 12, 4),
    ("P005", "Pan tajado Bimbo", 5600, 0, 3, 5),
    ("P006", "Gaseosa Postobón 1,5 L", 4800, 19, 30, 10),
    ("P007", "Papas Margarita pollo", 2500, 19, 50, 12),
    ("P008", "Jabón Rey barra", 2200, 19, 20, 6),
    ("P009", "Café Sello Rojo 250 g", 8900, 0, 18, 5),
    ("P010", "Panela cuadrada", 3100, 0, 2, 6),
    ("P011", "Azúcar Manuelita 1 kg", 4600, 0, 25, 8),
    ("P012", "Lentejas Roa 500 g", 3900, 0, 14, 5),
    ("P013", "Detergente Fab 1 kg", 9500, 19, 10, 4),
    ("P014", "Cerveza Águila lata", 3200, 19, 48, 12),
    ("P015", "Atún Van Camps lata", 6800, 19, 16, 6),
]


def sembrar_productos(db: Session) -> int:
    """Agrega los productos que falten; devuelve cuántos creó."""
    existentes = set(db.scalars(select(Producto.codigo)).all())
    nuevos = 0
    for codigo, nombre, precio, iva, stock, minimo in PRODUCTOS:
        if codigo in existentes:
            continue
        producto = Producto(codigo=codigo, nombre=nombre, precio=Decimal(precio), iva=iva, stock=stock, stock_minimo=minimo)
        db.add(producto)
        db.flush()
        db.add(MovimientoInventario(producto_id=producto.id, tipo="entrada", cantidad=stock, nota="Stock inicial (seed)"))
        nuevos += 1
    db.commit()
    return nuevos


def sembrar_dev() -> int:
    with SessionLocal() as db:
        return sembrar_productos(db)
