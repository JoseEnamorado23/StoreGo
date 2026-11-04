"""Verificación rápida del servicio real (backend/app/services/factus_facturacion.py) contra el sandbox.

Crea 1 factura (IVA 19 + IVA 0, consumidor final) y 1 nota crédito parcial sobre ella.
Uso: python scripts/verificar_servicio_facturacion.py
"""

import asyncio
import os
import sys
import time
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _comun import cargar_env  # noqa: E402

env = cargar_env()
for k, v in env.items():
    os.environ.setdefault(k, v)
# Valores de relleno solo para que Settings cargue; no se usan.
for k, v in {"APP_ADMIN_EMAIL": "x@x.co", "APP_ADMIN_PASSWORD": "x", "JWT_SECRET": "x" * 32,
             "DATABASE_URL": "sqlite://", "FACTUS_PAY_WEBHOOK_KEY": "x"}.items():
    os.environ.setdefault(k, v)
os.environ["FACTUS_MODE"] = "real"

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
from app.schemas.factus import ItemFactura, PagoFactura  # noqa: E402
from app.services import factus_facturacion as fact  # noqa: E402


async def main():
    pref = os.environ.get("REFERENCE_PREFIX", "TF")
    ref = f"{pref}-SVC-{int(time.time())}"
    print("rangos:", {t: await fact.rango_para(t) for t in ("factura", "nota_credito", "nota_debito")})
    items = [
        ItemFactura(codigo="ACE-1", nombre="Aceite 1 L", cantidad=Decimal(2), precio=Decimal("10000"), iva=19),
        ItemFactura(codigo="ARR-1", nombre="Arroz 500 g", cantidad=Decimal(1), precio=Decimal("2400"), iva=0),
    ]
    total = Decimal("10000") * 2 * Decimal("1.19") + Decimal("2400")
    pago = PagoFactura(forma="contado", metodo_codigo="10", monto=total)
    f = await fact.crear_factura(ref, items, pago)
    print("factura:", f.numero, "validada:", f.is_validated, "cufe:", bool(f.cufe), "avisos:", type(f.errores).__name__)
    # fuerza una renovación por 401: token inválido en memoria
    fact._access_token = "invalido"
    fact._vence_en = time.monotonic() + 3000
    pago_nc = PagoFactura(forma="contado", metodo_codigo="10", monto=Decimal("11900"))
    nc = await fact.crear_nota_credito(f"{ref}-NC1", f.numero, 1, [items[0].model_copy(update={"cantidad": Decimal(1)})], pago_nc)
    print("nota crédito:", nc.numero, "validada:", nc.is_validated, "cude:", bool(nc.cufe), "avisos:", type(nc.errores).__name__)
    again = await fact.crear_factura(ref, items, pago)
    print("reenvío idempotente:", again.numero == f.numero)


asyncio.run(main())
