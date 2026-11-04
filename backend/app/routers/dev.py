"""Solo se registra con FACTUS_MODE=fake (ver main.py)."""

from fastapi import APIRouter, HTTPException

from app.schemas.common import OkOut
from app.services import fakes, ventas

router = APIRouter(prefix="/api/dev", tags=["dev"])


@router.post("/simular-pago/{reference_code}", response_model=OkOut)
async def simular_pago(reference_code: str):
    """Marca el recaudo como pagado en el falso y procesa el pago como lo haría el webhook."""
    fakes.PAGADOS.add(reference_code)
    try:
        await ventas.procesar_pago_confirmado(reference_code)
    except NotImplementedError:
        raise HTTPException(status_code=501, detail="Pendiente: Ventas")
    return OkOut()
