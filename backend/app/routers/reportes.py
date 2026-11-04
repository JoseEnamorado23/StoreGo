from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.ventas import ResumenOut
from app.services import ventas

router = APIRouter(prefix="/api/reportes", tags=["reportes"])


@router.get("/resumen", response_model=ResumenOut)
def resumen(db: Session = Depends(get_db)):
    return ventas.resumen(db)
