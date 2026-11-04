from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Cliente
from app.schemas.clientes import CarteraOut, ClienteCreate, ClienteOut
from app.services import ventas

router = APIRouter(prefix="/api/clientes", tags=["clientes"])


@router.get("", response_model=list[ClienteOut])
def listar(q: str | None = None, db: Session = Depends(get_db)):
    """`q` busca por nombre o documento."""
    consulta = select(Cliente).order_by(Cliente.nombres)
    if q:
        patron = f"%{q.strip()}%"
        consulta = consulta.where(or_(Cliente.nombres.ilike(patron), Cliente.documento.ilike(patron)))
    return db.scalars(consulta).all()


@router.post("", response_model=ClienteOut, status_code=201)
def crear(datos: ClienteCreate, db: Session = Depends(get_db)):
    repetido = db.scalar(
        select(Cliente).where(Cliente.tipo_documento == datos.tipo_documento, Cliente.documento == datos.documento)
    )
    if repetido is not None:
        raise HTTPException(status_code=409, detail="Ya existe un cliente con ese documento")
    cliente = Cliente(**datos.model_dump())
    db.add(cliente)
    db.commit()
    return cliente


@router.get("/{cliente_id}/cartera", response_model=CarteraOut)
def cartera(cliente_id: int, db: Session = Depends(get_db)):
    return ventas.cartera(db, cliente_id)
