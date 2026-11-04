"""Interpretación de pedidos dictados por voz (texto ya transcrito) con un LLM.

Pendiente: Voz. Usa LLM_PROVIDER y LLM_API_KEY del entorno.
"""

from app.schemas.voz import VozOut


async def interpretar(texto: str) -> VozOut:
    """Convierte "dos arroces y una leche a Doña Marta fiado" en items del catálogo,
    cliente y tipo de pago. Lo que no logra mapear va en `no_reconocidos`.
    """
    raise NotImplementedError("Pendiente: Voz")
