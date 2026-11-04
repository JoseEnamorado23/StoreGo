"""Explora la API real de Factus Pay (sandbox) y guarda las respuestas en docs/payloads/pay_*.json.

Fase 1:  python scripts/probar_pay.py            -> crea y consulta recaudos, deja uno "ready"
Fase 2:  python scripts/probar_pay.py --esperar  -> consulta hasta ver status "paid"
         (antes, paga el recaudo en https://pay-api-sandbox.factus.com.co/simulator)
"""

import sys
import time

from _comun import RAIZ, cargar_env, cliente_http, exigir, guardar, mensaje

ARCHIVO_REF = RAIZ / "scripts" / ".pay_ref"
EXTRA = ("email",)  # en pay_auth también se oculta el correo
resumen: list[tuple[str, str, int, str]] = []


def main() -> None:
    env = cargar_env()
    exigir(env, ["FACTUS_PAY_BASE_URL", "FACTUS_PAY_EMAIL", "FACTUS_PAY_PASSWORD", "REFERENCE_PREFIX"])
    base = env["FACTUS_PAY_BASE_URL"].rstrip("/")
    cli = cliente_http()

    # Un solo login: cada login revoca el token anterior
    r = cli.post(f"{base}/auth", json={"email": env["FACTUS_PAY_EMAIL"], "password": env["FACTUS_PAY_PASSWORD"]})
    reg = guardar("pay_auth", "POST", f"{base}/auth", {"email": env["FACTUS_PAY_EMAIL"], "password": env["FACTUS_PAY_PASSWORD"]}, r, EXTRA)
    resumen.append(("auth", "POST /auth", r.status_code, mensaje(reg["response"]["body"])))
    if r.status_code >= 400:
        imprimir()
        sys.exit("No se pudo autenticar en Factus Pay")
    cuerpo = r.json()
    token = cuerpo.get("token") or (cuerpo.get("data") or {}).get("token")
    if not token:
        sys.exit("La respuesta de /auth no trae token en 'token' ni en 'data.token' (ver pay_auth.json)")
    cab = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

    def llamar(nombre: str, metodo: str, ruta: str, json=None):
        resp = cli.request(metodo, f"{base}{ruta}", json=json, headers=cab)
        reg = guardar(nombre, metodo, f"{base}{ruta}", json, resp)
        resumen.append((nombre, f"{metodo} {ruta}", resp.status_code, mensaje(reg["response"]["body"])))
        return resp

    if "--esperar" in sys.argv:
        if not ARCHIVO_REF.exists():
            sys.exit("No hay recaudo previo: corre primero la fase 1 (sin --esperar)")
        ref = ARCHIVO_REF.read_text().strip()
        print(f"Consultando {ref} hasta ver 'paid' (máx. 5 min)...")
        for _ in range(60):
            resp = llamar("pay_consulta_paid", "GET", f"/v1/collections/{ref}")
            datos = resp.json().get("data", {}) if resp.status_code == 200 else {}
            print(f"  status = {datos.get('status')}")
            if datos.get("status") == "paid":
                break
            time.sleep(5)
        imprimir()
        return

    ref = f"{env['REFERENCE_PREFIX']}-PRUEBA-{int(time.time())}"
    ARCHIVO_REF.write_text(ref)

    llamar("pay_crear", "POST", "/v1/collections", {"reference_code": ref, "amount": 15000, "expiration": 86400})
    llamar("pay_crear_repetido", "POST", "/v1/collections", {"reference_code": ref, "amount": 15000, "expiration": 86400})
    llamar("pay_crear_monto_menor", "POST", "/v1/collections", {"reference_code": f"{ref}-MIN", "amount": 5000, "expiration": 86400})
    llamar("pay_crear_monto_limite_min", "POST", "/v1/collections", {"reference_code": f"{ref}-L10K", "amount": 10_000, "expiration": 86400})
    llamar("pay_crear_monto_mayor", "POST", "/v1/collections", {"reference_code": f"{ref}-MAX", "amount": 12_000_001, "expiration": 86400})
    llamar("pay_consulta_ready", "GET", f"/v1/collections/{ref}")
    llamar("pay_consulta_inexistente", "GET", f"/v1/collections/{ref}-NOEXISTE")
    imprimir()
    print(f"\nRecaudo creado: {ref}")
    print("Ahora paga ese reference_code en https://pay-api-sandbox.factus.com.co/simulator")
    print("y luego corre:  python scripts/probar_pay.py --esperar")


def imprimir() -> None:
    print(f"\n{'archivo':28} {'llamada':42} {'HTTP':5} mensaje")
    for nombre, llamada, status, msg in resumen:
        print(f"{nombre:28} {llamada[:42]:42} {status:<5} {msg}")


if __name__ == "__main__":
    main()
