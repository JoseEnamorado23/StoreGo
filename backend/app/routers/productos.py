from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import MovimientoInventario, Producto
from app.schemas.productos import EntradaIn, ProductoCreate, ProductoOut, ProductoUpdate

router = APIRouter(prefix="/api/productos", tags=["productos"])


def _producto(db: Session, producto_id: int) -> Producto:
    producto = db.get(Producto, producto_id)
    if producto is None:
        raise HTTPException(status_code=404, detail="El producto no existe")
    return producto


def _exigir_codigo_libre(db: Session, codigo: str | None, propio_id: int | None = None) -> None:
    if not codigo:
        return
    otro = db.scalar(select(Producto).where(Producto.codigo == codigo))
    if otro is not None and otro.id != propio_id:
        raise HTTPException(status_code=409, detail=f"Ya existe un producto con el código «{codigo}»")


@router.get("", response_model=list[ProductoOut])
def listar(q: str | None = None, bajo_stock: bool = False, db: Session = Depends(get_db)):
    """Productos activos. `q` busca por nombre o código; `bajo_stock` deja los de stock <= stock_minimo."""
    consulta = select(Producto).where(Producto.activo.is_(True)).order_by(Producto.nombre)
    if q:
        patron = f"%{q.strip()}%"
        consulta = consulta.where(or_(Producto.nombre.ilike(patron), Producto.codigo.ilike(patron)))
    if bajo_stock:
        consulta = consulta.where(Producto.stock <= Producto.stock_minimo)
    return db.scalars(consulta).all()


@router.post("", response_model=ProductoOut, status_code=201)
def crear(datos: ProductoCreate, db: Session = Depends(get_db)):
    _exigir_codigo_libre(db, datos.codigo)
    producto = Producto(**datos.model_dump())
    db.add(producto)
    db.flush()
    if producto.stock:
        db.add(MovimientoInventario(producto_id=producto.id, tipo="entrada", cantidad=producto.stock, nota="Stock inicial"))
    db.commit()
    return producto


@router.put("/{producto_id}", response_model=ProductoOut)
def actualizar(producto_id: int, datos: ProductoUpdate, db: Session = Depends(get_db)):
    """Actualiza solo los campos enviados. Para sumar stock con trazabilidad usa POST /entrada."""
    producto = _producto(db, producto_id)
    cambios = datos.model_dump(exclude_unset=True)
    if "codigo" in cambios:
        _exigir_codigo_libre(db, cambios["codigo"], producto.id)
    for campo, valor in cambios.items():
        if valor is None and campo != "codigo":
            continue  # un campo obligatorio enviado como null se ignora
        setattr(producto, campo, valor)
    db.commit()
    return producto


@router.post("/{producto_id}/entrada", response_model=ProductoOut)
def entrada(producto_id: int, datos: EntradaIn, db: Session = Depends(get_db)):
    """Suma stock y registra un movimiento `entrada`."""
    producto = _producto(db, producto_id)
    producto.stock += datos.cantidad
    db.add(MovimientoInventario(producto_id=producto.id, tipo="entrada", cantidad=datos.cantidad, nota=datos.nota))
    db.commit()
    return producto
