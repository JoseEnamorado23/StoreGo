"""Cliente real de Factus Pay (recaudos con QR / llave Bre-B).

Pendiente: Factus Pay. Ver hechos verificados en AGENTS.md.
"""

from app.schemas.factus import RecaudoOut


async def crear_recaudo(reference_code: str, amount: int, expiration: int = 86400) -> RecaudoOut:
    """POST /v1/collections.

    - amount: entero COP entre 1000 y 12100000.
    - expiration: segundos (86400 por defecto).
    - 201 al crear; 200 "Recaudo ya existente" si el reference_code se repite.
    - Requiere token de /auth: único por usuario, pedirlo una vez y guardarlo en memoria.
    """
    raise NotImplementedError("Pendiente: Factus Pay")


async def obtener_recaudo(reference_code: str) -> RecaudoOut:
    """GET /v1/collections/{reference_code}. Devuelve status "ready" o "paid"."""
    raise NotImplementedError("Pendiente: Factus Pay")


def webhook_key_valida(key: str) -> bool:
    """Compara en tiempo constante `key` con FACTUS_PAY_WEBHOOK_KEY."""
    raise NotImplementedError("Pendiente: Factus Pay")
