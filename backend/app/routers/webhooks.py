import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from app.models import WebhookEvento
from app.schemas.common import OkOut
from app.services import pay, ventas

logger = logging.getLogger(__name__)

# Sin JWT: Factus Pay llama con ?key=LLAVE. Debe responder 2xx rápido.
router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


def _referencia(payload: dict) -> str:
    """El formato del webhook no está verificado: acepta el código arriba o dentro de `data`."""
    for origen in (payload, payload.get("data")):
        if isinstance(origen, dict) and isinstance(origen.get("reference_code"), str):
            return origen["reference_code"].strip()
    return ""


def _anotar(evento_id: int, nota: str | None, procesado: bool) -> None:
    # SessionLocal se lee del módulo de ventas para que las pruebas puedan reemplazarlo
    with ventas.SessionLocal() as db:
        evento = db.get(WebhookEvento, evento_id)
        if evento is None:
            return
        if nota:
            evento.payload = {**evento.payload, "_nota": nota}
        if procesado:
            evento.procesado_at = datetime.now(timezone.utc)
        db.commit()


async def _procesar(evento_id: int, reference_code: str) -> None:
    """Corre después de responder. Usa sesiones propias; nunca deja escapar una excepción."""
    try:
        ahora = await ventas.procesar_pago_confirmado(reference_code)
        nota = None if ahora else "Sin cambios: ya estaba procesado o Factus Pay aún no lo marca como pagado"
        _anotar(evento_id, nota, procesado=True)
    except HTTPException as e:
        logger.warning("Webhook de Factus Pay no procesado (%s): %s", reference_code, e.detail)
        _anotar(evento_id, f"No procesado: {e.detail}", procesado=False)
    except Exception as e:  # noqa: BLE001 - Factus ya recibió su 200; el evento queda guardado
        logger.error("Error inesperado procesando el webhook de %s: %s", reference_code, type(e).__name__)
        _anotar(evento_id, f"Error inesperado: {type(e).__name__}", procesado=False)


@router.post("/factus-pay", response_model=OkOut)
async def factus_pay(request: Request, background: BackgroundTasks, key: str = ""):
    if not key or not pay.webhook_key_valida(key):
        raise HTTPException(status_code=401, detail="Llave del webhook inválida")

    try:
        cuerpo = await request.json()
    except ValueError:
        cuerpo = None
    payload = cuerpo if isinstance(cuerpo, dict) else {"cuerpo": cuerpo}
    referencia = _referencia(payload)
    if cuerpo is None:
        payload = {"_nota": "El cuerpo no es un JSON válido"}
    elif not referencia:
        payload = {**payload, "_nota": "El payload no trae reference_code"}

    with ventas.SessionLocal() as db:
        evento = WebhookEvento(reference_code=referencia[:80], payload=payload)
        db.add(evento)
        db.commit()
        evento_id = evento.id

    if referencia:
        background.add_task(_procesar, evento_id, referencia)
    return OkOut(ok=True)
