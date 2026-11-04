"""Utilidades compartidas por los scripts de exploración de Factus."""

import json
import os
import sys
from pathlib import Path

import httpx

RAIZ = Path(__file__).resolve().parent.parent
PAYLOADS = RAIZ / "docs" / "payloads"

# Claves cuyo valor nunca se guarda en los payloads
_SECRETAS = {"token", "access_token", "refresh_token", "password", "client_secret", "authorization", "username", "client_id"}


def cliente_http() -> httpx.Client:
    """Cliente httpx que confía en el almacén de certificados del sistema (útil tras un proxy/antivirus
    que re-firma HTTPS). La verificación TLS sigue activa."""
    try:
        import ssl

        import truststore

        return httpx.Client(timeout=60, verify=truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT))
    except ImportError:
        return httpx.Client(timeout=60)


def cargar_env() -> dict:
    env = dict(os.environ)
    ruta = RAIZ / ".env"
    if ruta.exists():
        for linea in ruta.read_text(encoding="utf-8").splitlines():
            linea = linea.strip()
            if linea and not linea.startswith("#") and "=" in linea:
                k, v = linea.split("=", 1)
                v = v.strip()
                if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
                    v = v[1:-1]  # comillas envolventes, como hace dotenv
                env[k.strip()] = v
    return env


def exigir(env: dict, claves: list[str]) -> None:
    """Aborta si falta una variable o sigue con el valor de ejemplo."""
    malas = [c for c in claves if not env.get(c) or env[c].startswith("tu_")]
    if malas:
        sys.exit(f"Completa estas variables reales en .env antes de correr el script: {', '.join(malas)}")


def limpiar(obj, extra: tuple[str, ...] = ()):
    """Copia del objeto sin secretos; recorta el QR base64 para no llenar el archivo."""
    ocultar = _SECRETAS | set(extra)
    if isinstance(obj, dict):
        salida = {}
        for k, v in obj.items():
            if k.lower() in ocultar:
                salida[k] = "<redactado>"
            elif k == "qr" and isinstance(v, str) and len(v) > 80:
                salida[k] = f"{v[:60]}...<recortado, {len(v)} caracteres>"
            else:
                salida[k] = limpiar(v, extra)
        return salida
    if isinstance(obj, list):
        return [limpiar(x, extra) for x in obj]
    return obj


def guardar(nombre: str, metodo: str, url: str, peticion, resp: httpx.Response, extra: tuple[str, ...] = ()) -> dict:
    """Guarda petición + respuesta reales en docs/payloads/<nombre>.json (sin secretos)."""
    try:
        cuerpo = resp.json()
    except ValueError:
        cuerpo = resp.text
    registro = {
        "request": {"method": metodo, "url": url, "body": limpiar(peticion, extra)},
        "response": {"status": resp.status_code, "body": limpiar(cuerpo, extra)},
    }
    PAYLOADS.mkdir(parents=True, exist_ok=True)
    (PAYLOADS / f"{nombre}.json").write_text(
        json.dumps(registro, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return registro


def mensaje(cuerpo) -> str:
    """Resumen corto de una respuesta para la tabla de consola."""
    if isinstance(cuerpo, dict):
        for k in ("message", "detail", "error"):
            if cuerpo.get(k):
                return str(cuerpo[k])[:90]
    return str(cuerpo)[:90]
