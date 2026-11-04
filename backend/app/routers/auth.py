from fastapi import APIRouter, HTTPException

from app.schemas.common import LoginIn, TokenOut
from app.security import credenciales_validas, crear_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut)
def login(datos: LoginIn) -> TokenOut:
    if not credenciales_validas(datos.email, datos.password):
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos")
    return TokenOut(token=crear_token(datos.email))
