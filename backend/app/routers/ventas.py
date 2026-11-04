"""Endpoints de ventas. Toda la lógica (incluidas las llamadas a Factus) vive en services/ventas.py."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.ventas import (
    AbonoIn,
    NotaCreditoIn,
    NotaDebitoIn,
    VentaCreate,
    VentaDetalle,
    VentaResumen,
)
from app.services import ventas

router = APIRouter(prefix="/api/ventas", tags=["ventas"])


@router.post("", response_model=VentaDetalle, status_code=201)
async def crear(datos: VentaCreate, db: Session = Depends(get_db)):
    return ventas.detalle(await ventas.crear_venta(db, datos))


@router.get("", response_model=list[VentaResumen])
def listar(estado: str | None = None, cliente_id: int | None = None, db: Session = Depends(get_db)):
    return ventas.listar_ventas(db, estado, cliente_id)


@router.get("/{venta_id}", response_model=VentaDetalle)
def detalle(venta_id: int, db: Session = Depends(get_db)):
    return ventas.detalle(ventas.obtener_venta(db, venta_id))


@router.post("/{venta_id}/refrescar-pago", response_model=VentaDetalle)
async def refrescar_pago(venta_id: int, db: Session = Depends(get_db)):
    return ventas.detalle(await ventas.refrescar_pago(db, venta_id))


@router.post("/{venta_id}/abonos", response_model=VentaDetalle)
async def abonar(venta_id: int, datos: AbonoIn, db: Session = Depends(get_db)):
    return ventas.detalle(await ventas.crear_abono(db, venta_id, datos))


@router.post("/{venta_id}/nota-credito", response_model=VentaDetalle)
async def nota_credito(venta_id: int, datos: NotaCreditoIn, db: Session = Depends(get_db)):
    return ventas.detalle(await ventas.crear_nota_credito(db, venta_id, datos))


@router.post("/{venta_id}/nota-debito", response_model=VentaDetalle)
async def nota_debito(venta_id: int, datos: NotaDebitoIn, db: Session = Depends(get_db)):
    return ventas.detalle(await ventas.crear_nota_debito(db, venta_id, datos))
