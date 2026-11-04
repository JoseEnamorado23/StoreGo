import hmac
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings

_bearer = HTTPBearer(auto_error=False)
_ALGORITMO = "HS256"
_HORAS_VALIDEZ = 12


def credenciales_validas(email: str, password: str) -> bool:
    ok_email = hmac.compare_digest(email.encode(), settings.app_admin_email.encode())
    ok_pass = hmac.compare_digest(password.encode(), settings.app_admin_password.encode())
    return ok_email and ok_pass


def crear_token(email: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=_HORAS_VALIDEZ)
    return jwt.encode({"sub": email, "exp": exp}, settings.jwt_secret, algorithm=_ALGORITMO)


def usuario_actual(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    """Dependencia: exige un Bearer JWT válido y devuelve el email."""
    if cred is None:
        raise HTTPException(status_code=401, detail="Falta el token de autenticación")
    try:
        datos = jwt.decode(cred.credentials, settings.jwt_secret, algorithms=[_ALGORITMO])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token inválido o vencido")
    return datos["sub"]
