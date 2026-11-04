"""Prueba de punta a punta del backend (httpx) contra http://localhost:8000 con FACTUS_MODE=fake.

Uso:  python scripts/prueba_e2e.py
Lee APP_ADMIN_EMAIL, APP_ADMIN_PASSWORD y FACTUS_PAY_WEBHOOK_KEY del entorno o del .env.
No imprime tokens ni claves. Si /api/health dice factus_mode=real, se detiene.
"""

import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _comun import cargar_env  # noqa: E402

BASE = "http://localhost:8000"
RESULTADOS: list[tuple[str, bool, str]] = []
SUF = str(int(time.time()))[-6:]


# ---------- utilidades ----------
def paso(nombre: str, ok: bool, codigo, motivo: str = "") -> bool:
    RESULTADOS.append((nombre, ok, f"{codigo} {motivo}".strip()))
    print(f"[{'OK' if ok else 'FALLÓ'}] {nombre} -> HTTP {codigo} {motivo}")
    return ok


def detalle(r: httpx.Response) -> str:
    try:
        d = r.json()
        return str(d.get("detail", d))[:160] if isinstance(d, dict) else ""
    except ValueError:
        return r.text[:160]


def esperar(nombre: str, r: httpx.Response, esperado: int | tuple, motivo_ok: str = "") -> bool:
    esp = (esperado,) if isinstance(esperado, int) else esperado
    ok = r.status_code in esp
    return paso(nombre, ok, r.status_code, motivo_ok if ok else f"(esperado {esperado}) {detalle(r)}")


def chequeo(nombre: str, cond: bool, motivo: str, codigo="-") -> bool:
    return paso(nombre, bool(cond), codigo, motivo)


def abortar(msg: str):
    print(f"\nDETENIDO: {msg}")
    sys.exit(1)


def main():
    env = cargar_env()
    email, clave = env.get("APP_ADMIN_EMAIL", ""), env.get("APP_ADMIN_PASSWORD", "")
    wh_key = env.get("FACTUS_PAY_WEBHOOK_KEY", "")
    print("Variables presentes:", {k: bool(v) for k, v in
          {"APP_ADMIN_EMAIL": email, "APP_ADMIN_PASSWORD": clave, "FACTUS_PAY_WEBHOOK_KEY": wh_key}.items()})

    c = httpx.Client(base_url=BASE, timeout=30)

    # ---------- health ----------
    try:
        h = c.get("/api/health")
    except httpx.HTTPError as e:
        abortar(f"No se pudo conectar con {BASE} ({type(e).__name__}). ¿Está corriendo el backend?")
    if h.status_code != 200 or h.json().get("factus_mode") != "fake":
        abortar(f"factus_mode={h.json().get('factus_mode') if h.status_code == 200 else h.status_code}: "
                "solo se corre con 'fake' para no crear documentos reales en el sandbox.")
    paso("Health: modo fake", True, 200, "factus_mode=fake")
    if not (email and clave):
        abortar("Faltan APP_ADMIN_EMAIL / APP_ADMIN_PASSWORD en el entorno o en .env")

    # ---------- 1. Auth ----------
    r = c.post("/api/auth/login", json={"email": email, "password": clave})
    if not esperar("1a Login correcto", r, 200) or "token" not in r.json():
        abortar("Sin token no se puede seguir")
    auth = {"Authorization": f"Bearer {r.json()['token']}"}
    r = c.post("/api/auth/login", json={"email": email, "password": clave + "x_mala"})
    esperar("1b Login con clave mala rechazado", r, 401, "rechazado")
    r = c.get("/api/productos")
    esperar("1c Petición sin token rechazada", r, (401, 403), "rechazada")

    def api(metodo, ruta, **kw):
        return c.request(metodo, ruta, headers=auth, **kw)

    # ---------- 2. Productos ----------
    r = api("GET", "/api/productos")
    esperar("2a Listar productos (seed)", r, 200, f"{len(r.json()) if r.status_code == 200 else 0} productos")
    pa = pb = None
    r = api("POST", "/api/productos", json={"nombre": f"E2E Galleta {SUF}", "precio": 20000, "iva": 19,
                                            "stock": 100, "stock_minimo": 5, "codigo": f"E2EA{SUF}"})
    if esperar("2b Crear producto A (IVA 19, stock 100)", r, 201):
        pa = r.json()
        chequeo("2b' stock inicial A = 100", pa["stock"] == 100, f"stock={pa['stock']}")
    r = api("POST", "/api/productos", json={"nombre": f"E2E Cuaderno {SUF}", "precio": 12000, "iva": 0,
                                            "stock": 100, "stock_minimo": 5, "codigo": f"E2EB{SUF}"})
    if esperar("2c Crear producto B (IVA 0, stock 100)", r, 201):
        pb = r.json()
    pbajo = None
    r = api("POST", "/api/productos", json={"nombre": f"E2E Escaso {SUF}", "precio": 1000, "iva": 0,
                                            "stock": 2, "stock_minimo": 5, "codigo": f"E2EC{SUF}"})
    if esperar("2d Crear producto con stock bajo", r, 201):
        pbajo = r.json()
    if not (pa and pb):
        abortar("Sin productos propios no se pueden hacer las ventas")

    def stock(pid):
        r = api("GET", "/api/productos", params={"q": f"E2E"})
        for p in r.json():
            if p["id"] == pid:
                return p["stock"]
        return None

    r = api("POST", f"/api/productos/{pa['id']}/entrada", json={"cantidad": 10, "nota": "e2e"})
    if esperar("2e Entrada de mercancía (+10 a A)", r, (200, 201)):
        chequeo("2e' stock A = 110", r.json()["stock"] == 110, f"stock={r.json()['stock']}")
    r = api("GET", "/api/productos", params={"q": f"Galleta {SUF}"})
    chequeo("2f Búsqueda por texto encuentra A", r.status_code == 200 and any(p["id"] == pa["id"] for p in r.json()),
            f"{len(r.json()) if r.status_code == 200 else '?'} resultados", r.status_code)
    r = api("GET", "/api/productos", params={"bajo_stock": "true"})
    chequeo("2g bajo_stock incluye el escaso y excluye A",
            r.status_code == 200 and pbajo is not None and any(p["id"] == pbajo["id"] for p in r.json())
            and not any(p["id"] == pa["id"] for p in r.json()), "filtro de stock", r.status_code)
    sA, sB = 110, 100  # stock esperado, se va actualizando

    # ---------- 3. Clientes ----------
    doc = f"9{SUF}001"
    cli_body = {"tipo_documento": "13", "documento": doc, "nombres": f"Cliente E2E {SUF}",
                "telefono": "3001112233", "email": "e2e@example.com", "direccion": "Calle 1"}
    r = api("POST", "/api/clientes", json=cli_body)
    cli = None
    if esperar("3a Crear cliente (tolera 409)", r, (201, 409)):
        cli = r.json() if r.status_code == 201 else None
    r = api("GET", "/api/clientes", params={"q": doc})
    if r.status_code == 200 and r.json():
        cli = cli or r.json()[0]
    chequeo("3b Buscar cliente por documento", r.status_code == 200 and bool(r.json()),
            f"{len(r.json()) if r.status_code == 200 else '?'} resultados", r.status_code)

    # ---------- 4. Venta efectivo ----------
    r = api("POST", "/api/ventas", json={"tipo_pago": "efectivo", "facturar": True,
                                         "items": [{"producto_id": pa["id"], "cantidad": 3}]})
    if esperar("4a Venta efectivo con factura", r, 201):
        v = r.json()
        chequeo("4a' estado pagada", v["estado"] == "pagada", f"estado={v['estado']}")
        facts = [d for d in v["documentos"] if d["tipo"] == "factura"]
        chequeo("4a'' factura emitida y validada", len(facts) == 1 and facts[0]["is_validated"],
                f"{len(facts)} factura(s), numero={facts[0]['numero'] if facts else None}")
        sA -= 3
        chequeo("4a''' stock A bajó 3", stock(pa["id"]) == sA, f"stock={stock(pa['id'])} esperado={sA}")
        v_efectivo = v
    else:
        v_efectivo = None
    r = api("POST", "/api/ventas", json={"tipo_pago": "efectivo",
                                         "items": [{"producto_id": pb["id"], "cantidad": 99999}]})
    esperar("4b Stock insuficiente -> 400", r, 400, "rechazada")

    # ---------- 5. Venta digital ----------
    r = api("POST", "/api/ventas", json={"tipo_pago": "digital", "facturar": True,
                                         "items": [{"producto_id": pa["id"], "cantidad": 1}]})
    vd = None
    if esperar("5a Venta digital creada", r, 201):
        vd = r.json()
        rec = vd["recaudos"][0] if vd["recaudos"] else {}
        chequeo("5a' esperando_pago con QR y breb_key",
                vd["estado"] == "esperando_pago" and str(rec.get("qr", "")).startswith("data:image")
                and bool(rec.get("breb_key")), f"estado={vd['estado']} qr={bool(rec.get('qr'))} breb={bool(rec.get('breb_key'))}")
        chequeo("5a'' stock A NO descontado aún", stock(pa["id"]) == sA, f"stock={stock(pa['id'])}")
        r = api("POST", f"/api/dev/simular-pago/{rec['reference_code']}")
        esperar("5b Simular pago", r, 200)
        r = api("GET", f"/api/ventas/{vd['id']}")
        if r.status_code == 200:
            v = r.json()
            sA -= 1
            chequeo("5c pagada con factura y stock descontado",
                    v["estado"] == "pagada" and any(d["tipo"] == "factura" for d in v["documentos"])
                    and stock(pa["id"]) == sA,
                    f"estado={v['estado']} docs={[d['tipo'] for d in v['documentos']]} stock={stock(pa['id'])}")
        r = api("POST", f"/api/ventas/{vd['id']}/refrescar-pago")
        if esperar("5d refrescar-pago (idempotente)", r, 200):
            v = r.json()
            chequeo("5d' sigue pagada, 1 factura, stock sin cambio",
                    v["estado"] == "pagada" and sum(d["tipo"] == "factura" for d in v["documentos"]) == 1
                    and stock(pa["id"]) == sA, f"estado={v['estado']} stock={stock(pa['id'])}")

    # ---------- 6. Fiado ----------
    vence = time.strftime("%Y-%m-%d", time.localtime(time.time() + 30 * 86400))
    r = api("POST", "/api/ventas", json={"tipo_pago": "fiado", "due_date": vence,
                                         "items": [{"producto_id": pa["id"], "cantidad": 2}]})
    esperar("6a Fiado sin cliente rechazado (422)", r, 422, "rechazado")
    vf = None
    if cli:
        r = api("POST", "/api/ventas", json={"tipo_pago": "fiado", "cliente_id": cli["id"], "due_date": vence,
                                             "items": [{"producto_id": pa["id"], "cantidad": 2}]})
        if esperar("6b Fiado con cliente", r, 201):
            vf = r.json()
            sA -= 2
            fac = [d for d in vf["documentos"] if d["tipo"] == "factura"]
            chequeo("6b' fiado_abierto, factura emitida, saldo = total",
                    vf["estado"] == "fiado_abierto" and len(fac) == 1 and vf["saldo"] == vf["total"],
                    f"estado={vf['estado']} total={vf['total']} saldo={vf['saldo']}")
    if vf:
        r = api("POST", f"/api/ventas/{vf['id']}/abonos", json={"monto": 5000})
        esperar("6c Abono < mínimo rechazado (422)", r, 422, "rechazado")
        r = api("POST", f"/api/ventas/{vf['id']}/abonos", json={"monto": 10000})
        if esperar("6d Abono de 10000 con recaudo", r, (200, 201)):
            ab = [x for x in r.json()["recaudos"] if x["tipo"] == "abono"]
            chequeo("6d' recaudo tipo abono con QR", len(ab) == 1 and ab[0]["monto"] == 10000
                    and bool(ab[0]["qr"]), f"{len(ab)} abono(s)")
            if ab:
                saldo0 = vf["saldo"]
                r = api("POST", f"/api/dev/simular-pago/{ab[0]['reference_code']}")
                esperar("6e Simular pago del abono", r, 200)
                r = api("GET", f"/api/ventas/{vf['id']}")
                if r.status_code == 200:
                    chequeo("6f saldo bajó exactamente 10000", r.json()["saldo"] == saldo0 - 10000,
                            f"antes={saldo0} después={r.json()['saldo']}")
        r = api("GET", f"/api/clientes/{cli['id']}/cartera")
        if esperar("6g Cartera del cliente", r, 200):
            cart = r.json()
            fila = [x for x in cart["ventas"] if x["venta_id"] == vf["id"]]
            chequeo("6g' cartera lista la venta con abonado=10000",
                    len(fila) == 1 and fila[0]["abonado"] == 10000 and cart["saldo_total"] >= fila[0]["saldo"],
                    f"filas={len(fila)} abonado={fila[0]['abonado'] if fila else None} saldo_total={cart['saldo_total']}")

    # ---------- 7. Notas (sobre una venta digital pagada) ----------
    vn = None
    r = api("POST", "/api/ventas", json={"tipo_pago": "digital", "facturar": True,
                                         "items": [{"producto_id": pa["id"], "cantidad": 2}]})
    if esperar("7.0 Venta digital para notas", r, 201):
        vn = r.json()
        api("POST", f"/api/dev/simular-pago/{vn['recaudos'][0]['reference_code']}")
        sA -= 2
        r = api("GET", f"/api/ventas/{vn['id']}")
        vn = r.json() if r.status_code == 200 else vn
        chequeo("7.0' venta pagada y facturada", vn["estado"] == "pagada", f"estado={vn['estado']}")
    if vn and vn["estado"] == "pagada":
        r = api("POST", f"/api/ventas/{vn['id']}/nota-credito",
                json={"concepto": 1, "items": [{"producto_id": pa["id"], "cantidad": 1}], "observacion": "e2e"})
        if esperar("7a Nota crédito concepto 1", r, (200, 201)):
            sA += 1
            nc = [d for d in r.json()["documentos"] if d["tipo"] == "nota_credito"]
            chequeo("7a' nota crédito validada y stock repuesto +1",
                    len(nc) == 1 and nc[0]["is_validated"] and stock(pa["id"]) == sA,
                    f"notas={len(nc)} stock={stock(pa['id'])} esperado={sA}")
        r = api("POST", f"/api/ventas/{vn['id']}/nota-debito",
                json={"concepto": 3, "items": [{"producto_id": pb["id"], "cantidad": 1}], "observacion": "e2e"})
        if esperar("7b Nota débito concepto 3", r, (200, 201)):
            sB -= 1
            rec = [x for x in r.json()["recaudos"] if x["tipo"] == "diferencia"]
            chequeo("7b' nota débito + recaudo diferencia + stock B -1",
                    any(d["tipo"] == "nota_debito" for d in r.json()["documentos"]) and len(rec) == 1
                    and stock(pb["id"]) == sB, f"recaudos diferencia={len(rec)} stock B={stock(pb['id'])}")
        r = api("POST", f"/api/ventas/{vn['id']}/nota-credito", json={"concepto": 2, "observacion": "e2e anulación"})
        if esperar("7c Nota crédito concepto 2 (anulación)", r, (200, 201)):
            v = r.json()
            chequeo("7c' estado anulada", v["estado"] == "anulada", f"estado={v['estado']}")
            chequeo("7c'' devolver_manual informado (pagó por QR)",
                    isinstance(v.get("devolver_manual"), int) and v["devolver_manual"] > 0,
                    f"devolver_manual={v.get('devolver_manual')}")

    # ---------- 8. Webhook ----------
    vw = None
    r = api("POST", "/api/ventas", json={"tipo_pago": "digital", "facturar": True,
                                         "items": [{"producto_id": pb["id"], "cantidad": 1}]})
    if esperar("8.0 Venta digital para webhook", r, 201):
        vw = r.json()
        ref = vw["recaudos"][0]["reference_code"]
        r = c.post("/api/webhooks/factus-pay", params={"key": "llave-incorrecta-e2e"}, json={"reference_code": ref})
        esperar("8a Webhook con key incorrecta -> 401", r, 401, "rechazado")
        if not wh_key:
            paso("8b Webhook con key correcta", False, "-", "falta FACTUS_PAY_WEBHOOK_KEY en el entorno/.env")
        else:
            api("POST", f"/api/dev/simular-pago/{ref}")  # deja el recaudo 'paid' en el falso y procesa
            sB -= 1
            time.sleep(1)
            r = c.post("/api/webhooks/factus-pay", params={"key": wh_key}, json={"reference_code": ref})
            if esperar("8b Webhook con key correcta -> 200", r, 200):
                chequeo("8b' cuerpo {ok:true}", r.json().get("ok") is True, str(r.json()))
            time.sleep(1.5)
            r2 = c.post("/api/webhooks/factus-pay", params={"key": wh_key}, json={"reference_code": ref})
            esperar("8c Webhook duplicado -> 200", r2, 200)
            time.sleep(1.5)
            r = api("GET", f"/api/ventas/{vw['id']}")
            if r.status_code == 200:
                v = r.json()
                nfac = sum(d["tipo"] == "factura" for d in v["documentos"])
                chequeo("8d duplicado no duplica factura ni stock",
                        v["estado"] == "pagada" and nfac == 1 and stock(pb["id"]) == sB,
                        f"estado={v['estado']} facturas={nfac} stock B={stock(pb['id'])} esperado={sB}")

    # ---------- 9. Voz ----------
    frases = [f"dos galletas e2e {SUF} y un cuaderno e2e {SUF} de contado",
              f"dso galeta e2e {SUF} y un cuadreno e2e {SUF} para doña marta fiado"]
    for i, f in enumerate(frases, 1):
        r = api("POST", "/api/voz/interpretar", json={"texto": f})
        if esperar(f"9{'ab'[i-1]} Voz frase {i}", r, 200):
            d = r.json()
            print(f"      items={[(x['nombre'], x['cantidad'], x['confianza']) for x in d['items']]}"
                  f"\n      no_reconocidos={d['no_reconocidos']} tipo_pago={d['tipo_pago']}"
                  f"\n      advertencia={d.get('advertencia')!r}")
            chequeo(f"9{'ab'[i-1]}' frase {i} reconoce al menos un ítem", len(d["items"]) >= 1,
                    f"{len(d['items'])} items, {len(d['no_reconocidos'])} no reconocidos")

    # ---------- 10. Reporte ----------
    r = api("GET", "/api/reportes/resumen")
    if esperar("10 Reporte resumen", r, 200):
        d = r.json()
        claves = {"ventas_hoy", "total_hoy", "fiado_pendiente", "productos_bajo_stock"}
        chequeo("10' campos del contrato presentes", claves <= d.keys(),
                f"faltan={sorted(claves - d.keys())} ventas_hoy={d.get('ventas_hoy')} total_hoy={d.get('total_hoy')} "
                f"fiado_pendiente={d.get('fiado_pendiente')}")

    # ---------- resumen ----------
    print("\n" + "=" * 100)
    print(f"{'PASO':<58}{'RESULTADO':<10}DETALLE")
    print("-" * 100)
    for n, ok, m in RESULTADOS:
        print(f"{n[:57]:<58}{'OK' if ok else 'FALLÓ':<10}{m[:90]}")
    bien = sum(ok for _, ok, _ in RESULTADOS)
    print("-" * 100)
    print(f"Total: {bien}/{len(RESULTADOS)} OK, {len(RESULTADOS) - bien} fallaron")
    sys.exit(0 if bien == len(RESULTADOS) else 1)


if __name__ == "__main__":
    main()
