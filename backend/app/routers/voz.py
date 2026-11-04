from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.voz import VozIn, VozOut
from app.services import voz

router = APIRouter(prefix="/api/voz", tags=["voz"])


@router.post("/interpretar", response_model=VozOut)
async def interpretar(datos: VozIn, db: Session = Depends(get_db)):
    """Interpreta una frase del tendero. No crea la venta: el frontend la confirma y llama a POST /api/ventas."""
    return await voz.interpretar(datos.texto, db)
