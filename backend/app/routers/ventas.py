from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.common import pendiente
from app.schemas.ventas import (
    AbonoIn,
    NotaCreditoIn,
    NotaDebitoIn,
    VentaCreate,
    VentaDetalle,
    VentaResumen,
)

router = APIRouter(prefix="/api/ventas", tags=["ventas"])


@router.post("", response_model=VentaDetalle)
async def crear(datos: VentaCreate, db: Session = Depends(get_db)):
    pendiente("ventas")


@router.get("", response_model=list[VentaResumen])
def listar(estado: str | None = None, cliente_id: int | None = None, db: Session = Depends(get_db)):
    pendiente("ventas")


@router.get("/{venta_id}", response_model=VentaDetalle)
def detalle(venta_id: int, db: Session = Depends(get_db)):
    pendiente("ventas")


@router.post("/{venta_id}/refrescar-pago", response_model=VentaDetalle)
async def refrescar_pago(venta_id: int, db: Session = Depends(get_db)):
    pendiente("ventas")


@router.post("/{venta_id}/abonos", response_model=VentaDetalle)
async def abonar(venta_id: int, datos: AbonoIn, db: Session = Depends(get_db)):
    pendiente("ventas")


@router.post("/{venta_id}/nota-credito", response_model=VentaDetalle)
async def nota_credito(venta_id: int, datos: NotaCreditoIn, db: Session = Depends(get_db)):
    pendiente("ventas")


@router.post("/{venta_id}/nota-debito", response_model=VentaDetalle)
async def nota_debito(venta_id: int, datos: NotaDebitoIn, db: Session = Depends(get_db)):
    pendiente("ventas")
