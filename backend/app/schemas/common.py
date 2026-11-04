from decimal import Decimal
from typing import Annotated, Literal, NoReturn

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, PlainSerializer

# Dinero que sale como número en el JSON (no como string)
Dinero = Annotated[Decimal, PlainSerializer(float, return_type=float, when_used="json")]

TipoPago = Literal["efectivo", "digital", "fiado"]
EstadoVenta = Literal["esperando_pago", "pagada", "fiado_abierto", "fiado_pagado", "anulada"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class LoginIn(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    token: str


class HealthOut(BaseModel):
    status: str
    factus_mode: str


class OkOut(BaseModel):
    ok: bool = True


def pendiente(area: str) -> NoReturn:
    """Respuesta estándar de los endpoints aún sin implementar."""
    raise HTTPException(status_code=501, detail=f"Pendiente: {area}")
