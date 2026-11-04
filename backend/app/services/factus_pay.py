"""Cliente real de Factus Pay (recaudos con QR / llave Bre-B). Hechos verificados en AGENTS.md.

- Siempre se envía `Accept: application/json` (sin él los errores responden 302 con HTML).
- El token es único por usuario (cada login revoca el anterior): se pide una vez y se guarda en memoria.
- Las fechas (p. ej. "04-11-2026 11:21:16 AM") se guardan como texto, sin parsear.
"""

import asyncio
import hmac

import httpx
from fastapi import HTTPException

from app.config import settings
from app.schemas.factus import RecaudoOut
from app.services._http import cliente as _crear_cliente

_http = _crear_cliente(settings.factus_pay_base_url)
_token: str | None = None
_candado = asyncio.Lock()


async def _obtener_token(renovar: bool = False) -> str:
    global _token
    async with _candado:
        if _token is None or renovar:
            r = await _http.post(
                "/auth", json={"email": settings.factus_pay_email, "password": settings.factus_pay_password}
            )
            if r.status_code != 200:
                raise HTTPException(status_code=502, detail="No se pudo autenticar en Factus Pay")
            _token = r.json()["token"]
        return _token


async def _pedir(metodo: str, ruta: str, json: dict | None = None) -> httpx.Response:
    """Llama con el token en memoria; ante un 401 renueva el token y reintenta una vez."""
    for intento in range(2):
        token = await _obtener_token(renovar=intento == 1)
        try:
            r = await _http.request(metodo, ruta, json=json, headers={"Authorization": f"Bearer {token}"})
        except httpx.HTTPError:
            raise HTTPException(status_code=502, detail="No se pudo conectar con Factus Pay")
        if r.status_code != 401:
            return r
    return r


def _a_recaudo(r: httpx.Response) -> RecaudoOut:
    d = r.json()["data"]
    return RecaudoOut(
        reference_code=d["reference_code"],
        amount=int(d["amount"]),
        status=d["status"],
        breb_key=d.get("breb_key"),
        qr=d.get("qr"),
        qr_expires_at=d.get("qr_expires_at"),
        collected_at=d.get("collected_at"),
    )


async def crear_recaudo(reference_code: str, amount: int, expiration: int = 86400) -> RecaudoOut:
    """POST /v1/collections.

    - amount: entero COP entre PAY_MIN_AMOUNT y PAY_MAX_AMOUNT (10000 y 12000000 en el sandbox).
    - expiration: segundos (86400 por defecto).
    - Responde 200 tanto al crear como si el reference_code ya existía ("Recaudo ya existente"):
      ambos casos se tratan como éxito y devuelven el recaudo.
    """
    if not settings.pay_min_amount <= amount <= settings.pay_max_amount:
        raise HTTPException(
            status_code=422,
            detail=f"El monto debe estar entre {settings.pay_min_amount} y {settings.pay_max_amount} COP",
        )
    r = await _pedir(
        "POST", "/v1/collections", {"reference_code": reference_code, "amount": amount, "expiration": expiration}
    )
    if r.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Factus Pay rechazó el recaudo: {_motivo(r)}")
    return _a_recaudo(r)


async def obtener_recaudo(reference_code: str) -> RecaudoOut:
    """GET /v1/collections/{reference_code}. Devuelve status "ready" o "paid"."""
    r = await _pedir("GET", f"/v1/collections/{reference_code}")
    if r.status_code == 404:
        raise HTTPException(status_code=404, detail="Recaudo no encontrado en Factus Pay")
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"No se pudo consultar el recaudo: {_motivo(r)}")
    return _a_recaudo(r)


def webhook_key_valida(key: str) -> bool:
    """Compara en tiempo constante `key` con FACTUS_PAY_WEBHOOK_KEY."""
    if not settings.factus_pay_webhook_key:
        return False
    return hmac.compare_digest(key.encode(), settings.factus_pay_webhook_key.encode())


def _motivo(r: httpx.Response) -> str:
    try:
        return str(r.json().get("message", r.status_code))
    except ValueError:
        return str(r.status_code)
