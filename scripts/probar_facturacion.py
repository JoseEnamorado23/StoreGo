"""Explora la API real de Factus Facturación (sandbox) y guarda peticiones y respuestas
en docs/payloads/factura_*.json, nota_credito_*.json y nota_debito_*.json (sin secretos).

Uso:  python scripts/probar_facturacion.py

Crea documentos reales en el sandbox (consume consecutivos de numeración).
Los payloads son un primer intento según AGENTS.md: si Factus rechaza un campo,
la respuesta queda guardada y sirve para corregirlo.
"""

import sys
import time
from datetime import date, timedelta
from decimal import Decimal

import httpx

from _comun import cargar_env, cliente_http, exigir, guardar, mensaje

resumen: list[tuple[str, str, int, str]] = []


class Factus:
    def __init__(self, env: dict):
        self.env = env
        self.base = env["FACTUS_BASE_URL"].rstrip("/")
        self.cli = cliente_http()
        self.token = ""
        self.refresh = ""

    def _guardar_tokens(self, resp: httpx.Response) -> None:
        d = resp.json()
        self.token, self.refresh = d.get("access_token", ""), d.get("refresh_token", "")

    def login(self) -> httpx.Response:
        form = {
            "grant_type": "password",
            "client_id": self.env["FACTUS_CLIENT_ID"],
            "client_secret": self.env["FACTUS_CLIENT_SECRET"],
            "username": self.env["FACTUS_USERNAME"],
            "password": self.env["FACTUS_PASSWORD"],
        }
        r = self.cli.post(f"{self.base}/oauth/token", data=form, headers={"Accept": "application/json"})
        reg = guardar("factura_token", "POST", f"{self.base}/oauth/token", form, r)
        resumen.append(("factura_token", "POST /oauth/token", r.status_code, mensaje(reg["response"]["body"])))
        if r.status_code == 200:
            self._guardar_tokens(r)
        return r

    def renovar(self) -> httpx.Response:
        form = {
            "grant_type": "refresh_token",
            "client_id": self.env["FACTUS_CLIENT_ID"],
            "client_secret": self.env["FACTUS_CLIENT_SECRET"],
            "refresh_token": self.refresh,
        }
        r = self.cli.post(f"{self.base}/oauth/token", data=form, headers={"Accept": "application/json"})
        guardar("factura_token_refresh", "POST", f"{self.base}/oauth/token", form, r)
        resumen.append(("factura_token_refresh", "POST /oauth/token (refresh)", r.status_code, mensaje(r.json() if r.status_code != 200 else {})))
        if r.status_code == 200:
            self._guardar_tokens(r)
        return r

    def llamar(self, nombre: str, metodo: str, ruta: str, json=None, params=None) -> httpx.Response:
        def enviar():
            return self.cli.request(
                metodo, f"{self.base}{ruta}", json=json, params=params,
                headers={"Authorization": f"Bearer {self.token}", "Accept": "application/json"},
            )

        r = enviar()
        if r.status_code == 401 and self.refresh:  # token vencido: renovar y reintentar una vez
            if self.renovar().status_code == 200:
                r = enviar()
        reg = guardar(nombre, metodo, f"{self.base}{ruta}", json if json is not None else params, r)
        resumen.append((nombre, f"{metodo} {ruta}", r.status_code, mensaje(reg["response"]["body"])))
        return r


def item(codigo: str, nombre: str, cantidad: int, precio: str, iva: int, variante_iva0: str = "a") -> dict:
    it = {
        "code_reference": codigo,
        "name": nombre,
        "quantity": cantidad,
        "price": precio,
        "unit_measure_code": "94",
        "standard_code": "999",
    }
    if iva == 19:
        it["taxes"] = [{"code": "01", "rate": "19.00"}]
    elif variante_iva0 == "a":  # IVA 0 como impuesto con tarifa 0
        it["taxes"] = [{"code": "01", "rate": "0.00"}]
    elif variante_iva0 == "b":  # producto excluido
        it["is_excluded"] = 1
    # variante "c": sin impuestos
    return it


CONSUMIDOR_FINAL = {"identification_document_code": "13", "identification": "22222222222", "names": "Consumidor Final"}
PERSONA_NATURAL = {
    "identification_document_code": "13",
    "identification": "1017123456",
    "names": "Juan Pérez Prueba",
    "legal_organization_code": "2",
    "email": "juan.prueba@example.com",
    "phone": "3001234567",
    "address": "Calle 1 # 2-3",
}


def numero_de(resp: httpx.Response) -> str | None:
    if resp.status_code not in (200, 201):
        return None
    d = resp.json().get("data", {})
    return d.get("number") or (d.get("bill") or {}).get("number")


def elegir_rango(rangos: list[dict], *palabras: str) -> int | None:
    for r in rangos:
        texto = str(r.get("document", "")).lower() + " " + str(r.get("document_name", "")).lower()
        if all(p in texto for p in palabras):
            return r.get("id")
    return None


def pago(items: list[dict], forma: str = "1", metodo: str = "10", vence: str | None = None) -> list[dict]:
    """payment_details de la v2: un pago por el total (con IVA) de los items."""
    total = Decimal(0)
    for it in items:
        tarifa = Decimal(it["taxes"][0]["rate"]) if it.get("taxes") else Decimal(0)
        total += Decimal(it["price"]) * it["quantity"] * (1 + tarifa / 100)
    detalle = {"payment_form": forma, "payment_method_code": metodo, "amount": f"{total:.2f}"}
    if vence:
        detalle["due_date"] = vence
    return [detalle]


def main() -> None:
    env = cargar_env()
    exigir(env, ["FACTUS_BASE_URL", "FACTUS_CLIENT_ID", "FACTUS_CLIENT_SECRET", "FACTUS_USERNAME", "FACTUS_PASSWORD", "REFERENCE_PREFIX"])
    f = Factus(env)
    if f.login().status_code != 200:
        imprimir()
        sys.exit("No se pudo obtener el token (ver docs/payloads/factura_token.json)")

    pref = f"{env['REFERENCE_PREFIX']}-PRUEBA-{int(time.time())}"

    # --- Rangos ---------------------------------------------------------------
    r = f.llamar("factura_rangos", "GET", "/v2/numbering-ranges", params={"filter[is_active]": 1})
    rangos = []
    if r.status_code == 200:
        d = r.json().get("data", [])
        rangos = d if isinstance(d, list) else d.get("data", [])
    print("\nRangos activos:")
    for x in rangos:
        print("  ", {k: x.get(k) for k in ("id", "document", "prefix", "current", "to", "resolution_number") if k in x})
    rango_factura = elegir_rango(rangos, "factura de venta")
    rango_nc = elegir_rango(rangos, "nota cr")
    rango_nd = elegir_rango(rangos, "nota d")
    print(f"  -> factura={rango_factura} nota_credito={rango_nc} nota_debito={rango_nd} (detección por nombre; revisa factura_rangos.json)")

    def con_rango(cuerpo: dict, rango: int | None) -> dict:
        if rango is not None:
            cuerpo["numbering_range_id"] = rango
        return cuerpo

    # --- IVA 0: probar tres representaciones -------------------------------------
    variante = None
    for v in ("a", "b", "c"):
        items = [item("ARROZ-1", "Arroz 500 g", 2, "2400.00", 0, v)]
        resp = f.llamar(f"factura_iva0_{v}", "POST", "/v2/bills/validate", json=con_rango({
            "reference_code": f"{pref}-IVA0{v.upper()}", "customer": CONSUMIDOR_FINAL,
            "payment_details": pago(items), "items": items,
        }, rango_factura))
        if resp.status_code in (200, 201) and variante is None:
            variante = v
    print(f"\nIVA 0: variante que funcionó = {variante or 'NINGUNA'} (a=tarifa 0.00, b=is_excluded, c=sin impuestos)")
    variante = variante or "a"

    cafe = item("CAFE-1", "Café 250 g", 1, "8900.00", 0, variante)
    aceite = item("ACEITE-1", "Aceite 1 L", 2, "11500.00", 19)

    # --- Facturas -----------------------------------------------------------------
    items = [aceite, cafe]
    cuerpo_cf = con_rango({
        "reference_code": f"{pref}-F1", "customer": CONSUMIDOR_FINAL,
        "payment_details": pago(items), "items": items,
    }, rango_factura)
    r_cf = f.llamar("factura_contado_consumidor_final", "POST", "/v2/bills/validate", json=cuerpo_cf)
    f.llamar("factura_reenvio_mismo_reference", "POST", "/v2/bills/validate", json=cuerpo_cf)

    r_nat = f.llamar("factura_contado_persona_natural", "POST", "/v2/bills/validate", json=con_rango({
        "reference_code": f"{pref}-F2", "customer": PERSONA_NATURAL,
        "payment_details": pago(items), "items": items,
    }, rango_factura))

    vence = (date.today() + timedelta(days=30)).isoformat()
    items_cre = [aceite]
    r_cre = f.llamar("factura_credito", "POST", "/v2/bills/validate", json=con_rango({
        "reference_code": f"{pref}-F3", "customer": PERSONA_NATURAL,
        "payment_details": pago(items_cre, "2", "47", vence), "items": items_cre,
    }, rango_factura))

    n_cf, n_nat, n_cre = numero_de(r_cf), numero_de(r_nat), numero_de(r_cre)
    print(f"\nNúmeros: consumidor final={n_cf} natural={n_nat} crédito={n_cre}")

    # --- Notas crédito ---------------------------------------------------------------
    if n_nat:
        it = [{**aceite, "quantity": 1}]
        f.llamar("nota_credito_concepto1", "POST", "/v2/credit-notes/validate", json=con_rango({
            "reference_code": f"{pref}-NC1", "correction_concept_code": 1, "customization_id": "20",
            "bill_number": n_nat, "customer": PERSONA_NATURAL, "observation": "Devolución parcial de prueba",
            "payment_details": pago(it), "items": it,
        }, rango_nc))
    if n_cf:
        f.llamar("nota_credito_concepto2", "POST", "/v2/credit-notes/validate", json=con_rango({
            "reference_code": f"{pref}-NC2", "correction_concept_code": 2, "customization_id": "20",
            "bill_number": n_cf, "customer": CONSUMIDOR_FINAL, "observation": "Anulación de prueba",
            "payment_details": pago(items), "items": items,
        }, rango_nc))

    # --- Nota débito -----------------------------------------------------------------
    if n_cre:
        it = [{**aceite, "quantity": 1, "price": "1000.00"}]
        f.llamar("nota_debito_concepto3", "POST", "/v2/debit-notes/validate", json=con_rango({
            "reference_code": f"{pref}-ND1", "correction_concept_code": 3, "customization_id": "30",
            "bill_number": n_cre, "customer": PERSONA_NATURAL, "observation": "Cambio de valor de prueba",
            "payment_details": pago(it), "items": it,
        }, rango_nd))

    # --- Errores provocados ------------------------------------------------------------
    f.llamar("factura_error_credito_sin_due_date", "POST", "/v2/bills/validate", json=con_rango({
        "reference_code": f"{pref}-E1", "customer": PERSONA_NATURAL,
        "payment_details": pago(items_cre, "2", "47"), "items": items_cre,
    }, rango_factura))
    f.llamar("nota_credito_error_factura_inexistente", "POST", "/v2/credit-notes/validate", json=con_rango({
        "reference_code": f"{pref}-E2", "correction_concept_code": 2, "customization_id": "20",
        "bill_number": "NOEXISTE999999", "customer": CONSUMIDOR_FINAL,
        "payment_details": pago(items_cre), "items": items_cre,
    }, rango_nc))

    # --- Borrado por reference_code ------------------------------------------------------
    # Endpoint confirmado en una pasada anterior: DELETE /v2/bills/destroy/reference/{reference_code}.
    # Se prueba con un reference_code que NO existe, para no borrar nada real.
    f.llamar("factura_borrar_inexistente", "DELETE", f"/v2/bills/destroy/reference/{pref}-NOEXISTE")

    imprimir()
    print("\nRevisa docs/payloads/ y compáralo con AGENTS.md.")


def imprimir() -> None:
    print(f"\n{'archivo':44} {'llamada':46} {'HTTP':5} mensaje")
    for nombre, llamada, status, msg in resumen:
        print(f"{nombre:44} {llamada[:46]:46} {status:<5} {msg}")


if __name__ == "__main__":
    main()
