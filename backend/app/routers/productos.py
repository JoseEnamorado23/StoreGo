from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.common import pendiente
from app.schemas.productos import EntradaIn, ProductoCreate, ProductoOut, ProductoUpdate

router = APIRouter(prefix="/api/productos", tags=["productos"])


@router.get("", response_model=list[ProductoOut])
def listar(q: str | None = None, bajo_stock: bool = False, db: Session = Depends(get_db)):
    pendiente("inventario")


@router.post("", response_model=ProductoOut)
def crear(datos: ProductoCreate, db: Session = Depends(get_db)):
    pendiente("inventario")


@router.put("/{producto_id}", response_model=ProductoOut)
def actualizar(producto_id: int, datos: ProductoUpdate, db: Session = Depends(get_db)):
    pendiente("inventario")


@router.post("/{producto_id}/entrada", response_model=ProductoOut)
def entrada(producto_id: int, datos: EntradaIn, db: Session = Depends(get_db)):
    pendiente("inventario")
