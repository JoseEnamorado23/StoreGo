from fastapi import APIRouter

from app.schemas.common import pendiente
from app.schemas.voz import VozIn, VozOut

router = APIRouter(prefix="/api/voz", tags=["voz"])


@router.post("/interpretar", response_model=VozOut)
async def interpretar(datos: VozIn):
    pendiente("voz")
