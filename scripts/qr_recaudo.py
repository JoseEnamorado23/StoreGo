"""Guarda en scripts/_tmp/qr_<reference_code>.png el QR de un recaudo de Factus Pay.

Uso: python scripts/qr_recaudo.py [reference_code] [monto]
Si el recaudo ya existe, Factus Pay devuelve el mismo (no se duplica).
"""

import base64
import sys

from _comun import RAIZ, cargar_env, cliente_http, exigir

env = cargar_env()
exigir(env, ["FACTUS_PAY_BASE_URL", "FACTUS_PAY_EMAIL", "FACTUS_PAY_PASSWORD"])
base = env["FACTUS_PAY_BASE_URL"].rstrip("/")
cli = cliente_http()
h = {"Accept": "application/json"}

token = cli.post(
    f"{base}/auth", json={"email": env["FACTUS_PAY_EMAIL"], "password": env["FACTUS_PAY_PASSWORD"]}, headers=h
).json()["token"]
h["Authorization"] = f"Bearer {token}"

ref = sys.argv[1] if len(sys.argv) > 1 else "TFJM-PRUEBA-1793809276"
monto = int(sys.argv[2]) if len(sys.argv) > 2 else 15000
r = cli.post(f"{base}/v1/collections", json={"reference_code": ref, "amount": monto, "expiration": 86400}, headers=h)
print(r.status_code, r.json().get("message"))
d = r.json()["data"]
print("estado:", d["status"], "| expira:", d["qr_expires_at"], "| llave Bre-B:", d["breb_key"])

salida = RAIZ / "scripts" / "_tmp"
salida.mkdir(parents=True, exist_ok=True)
archivo = salida / f"qr_{ref}.png"
archivo.write_bytes(base64.b64decode(d["qr"].split(",", 1)[1]))
print("QR guardado en", archivo)
