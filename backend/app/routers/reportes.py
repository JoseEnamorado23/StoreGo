from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.common import pendiente
from app.schemas.ventas import ResumenOut

router = APIRouter(prefix="/api/reportes", tags=["reportes"])


@router.get("/resumen", response_model=ResumenOut)
def resumen(db: Session = Depends(get_db)):
    pendiente("reportes")
