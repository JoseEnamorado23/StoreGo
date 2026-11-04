from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.clientes import CarteraOut, ClienteCreate, ClienteOut
from app.schemas.common import pendiente

router = APIRouter(prefix="/api/clientes", tags=["clientes"])


@router.get("", response_model=list[ClienteOut])
def listar(q: str | None = None, db: Session = Depends(get_db)):
    pendiente("clientes")


@router.post("", response_model=ClienteOut)
def crear(datos: ClienteCreate, db: Session = Depends(get_db)):
    pendiente("clientes")


@router.get("/{cliente_id}/cartera", response_model=CarteraOut)
def cartera(cliente_id: int, db: Session = Depends(get_db)):
    pendiente("clientes")
