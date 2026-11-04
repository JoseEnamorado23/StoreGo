from fastapi import APIRouter, Request

from app.schemas.common import OkOut, pendiente

# Sin JWT: Factus Pay llama con ?key=LLAVE. Debe responder 2xx rápido.
router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


@router.post("/factus-pay", response_model=OkOut)
async def factus_pay(request: Request, key: str = ""):
    pendiente("webhooks")
