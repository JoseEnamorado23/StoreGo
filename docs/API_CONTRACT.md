# Contrato de la API — Tienda Fácil

Fuente de verdad entre backend y frontend. Si cambias algo aquí, avisa al equipo y actualiza `frontend/lib/types.ts` y los schemas de `backend/app/schemas/`.

## Convenciones

- Prefijo `/api`. JSON en `snake_case`.
- Header `Authorization: Bearer <token>` en todo, **excepto** `GET /api/health`, `POST /api/auth/login` y `POST /api/webhooks/factus-pay`.
- Montos de dinero (precios, totales, saldos) salen como **número** JSON. Los montos de Factus Pay (`recaudos.monto`, `abonos.monto`) son **enteros en pesos COP**: mínimo 10000, máximo 12000000 (configurables con `PAY_MIN_AMOUNT` y `PAY_MAX_AMOUNT`).
- Fechas: ISO 8601 (`due_date` como `YYYY-MM-DD`).
- Errores: `{"detail": "mensaje en español"}` con el código HTTP correspondiente (400, 401, 404, 409, 422...).
- Mientras un área no esté implementada, el endpoint responde `501` con `{"detail": "Pendiente: <área>"}`. Ya funcionan `/api/health`, `/api/auth/login`, `/api/dev/*`, productos, clientes, ventas y reportes; siguen pendientes `/api/voz/*` y `/api/webhooks/*`.
- Los `POST` que crean (productos, clientes, ventas) responden `201`; el resto de `POST` responde `200`.

## Reglas de estado de las ventas

| tipo_pago | Estado inicial | Qué pasa al crear | Qué pasa después |
|---|---|---|---|
| `efectivo` | `pagada` | Descuenta stock. Factura solo si `facturar=true` (consumidor final si no hay cliente). | — |
| `digital` | `esperando_pago` | Crea el recaudo en Factus Pay (tipo `venta`, con QR y llave Bre-B). **No** descuenta stock todavía. | Al confirmarse el pago (webhook o `refrescar-pago`): pasa a `pagada`, descuenta stock y emite la factura (transferencia, código 47). |
| `fiado` | `fiado_abierto` | Requiere `cliente_id` y `due_date`. Descuenta stock y emite de inmediato la factura **a crédito**. | Cada abono es un recaudo tipo `abono`. Cuando la suma de abonos pagados iguala el total, pasa a `fiado_pagado`. |

- `saldo` (lo que falta por cobrar):
  - fiado: `total` + notas débito − notas crédito − abonos pagados (nunca negativo). Al llegar a 0 la venta pasa a `fiado_pagado`; si una nota débito lo sube de nuevo, vuelve a `fiado_abierto`.
  - digital: `total` mientras espera el pago; después, solo lo pendiente de recaudos tipo `diferencia`.
  - efectivo: 0. Anulada: 0.
- **Nota crédito** (requiere una factura validada; si no, `409`). Se emite primero en Factus: si Factus falla responde `502` y la venta no cambia.
  - Concepto `1` (devolución parcial, requiere `items`): repone el stock de esos items con el precio e IVA de la factura original y registra movimientos `devolucion`. No se puede devolver más de lo vendido (`422`).
  - Concepto `2` (anulación): usa todo lo no devuelto, deja la venta `anulada` y repone ese stock.
  - Concepto `5` (descuento por pronto pago): solo fiado; requiere `monto` (entero COP con IVA incluido, no mayor que el saldo). Baja el saldo; no mueve stock. El monto se reparte proporcionalmente entre las líneas de la factura.
  - `devolver_manual`: si parte de lo pagado por QR sobra frente a lo que finalmente se debe, el detalle trae ese monto en COP. Factus Pay no hace reversos: el tendero devuelve el dinero a mano.
- **Nota débito** (requiere factura validada): valida y descuenta el stock de los items agregados, al precio e IVA actuales del producto. Si la venta fue `digital`, crea un recaudo tipo `diferencia` por el valor con IVA (debe estar entre PAY_MIN_AMOUNT y PAY_MAX_AMOUNT, `422` si no). Si fue `fiado`, sube el saldo.
- **Factura pendiente**: si Factus falla al facturar una venta ya cobrada, la venta se conserva (el stock y el cobro no se pierden) y el detalle trae `factura_pendiente: true` con `factura_error` (mensaje legible). `POST /api/ventas/{id}/refrescar-pago` reintenta la factura.
- Si el pago digital se confirma y el stock ya no alcanza, el stock puede quedar negativo: el dinero ya se cobró.
- Los webhooks son idempotentes: Factus Pay puede reenviar el mismo evento hasta 6 veces.

### reference_code

| Qué | Formato |
|---|---|
| Venta y su factura / recaudo de venta | `{REFERENCE_PREFIX}-VENTA-0007` |
| Abono de un fiado | `{REFERENCE_PREFIX}-VENTA-0007-AB1` |
| Recaudo de la diferencia de una nota débito | `{REFERENCE_PREFIX}-VENTA-0007-ND1` |
| Nota crédito / nota débito | `{REFERENCE_PREFIX}-NC-0007-1` / `{REFERENCE_PREFIX}-ND-0007-1` |

## Objetos

```
Producto      { id, codigo|null, nombre, precio (sin IVA), iva (0|19), stock, stock_minimo, activo }
Cliente       { id, tipo_documento, documento, nombres, telefono|null, email|null, direccion|null }
VentaItem     { id, producto_id, nombre, cantidad, precio, iva }
Recaudo       { id, reference_code, tipo: venta|abono|diferencia, monto (int COP),
                estado: ready|paid|expired, breb_key|null, qr|null (data:image/png;base64,...),
                qr_expires_at|null, collected_at|null }
Documento     { id, tipo: factura|nota_credito|nota_debito, reference_code, numero|null, cufe|null,
                is_validated, public_url|null, factura_origen_id|null,
                errores|null (avisos de la DIAN: objeto en facturas, lista en notas),
                monto (valor con IVA del documento) }
VentaResumen  { id, reference_code, tipo_pago, estado, total (con IVA), cliente_id|null, due_date|null, created_at }
VentaDetalle  VentaResumen + { saldo, factura_pendiente: bool, factura_error: string|null,
                devolver_manual: int|null (COP), cliente: Cliente|null,
                items: [VentaItem], recaudos: [Recaudo], documentos: [Documento] }
```

Estados de venta: `esperando_pago | pagada | fiado_abierto | fiado_pagado | anulada`.

## Endpoints

### Salud y autenticación

#### `GET /api/health`
→ `{ "status": "ok", "factus_mode": "fake" | "real" }`

#### `POST /api/auth/login`
Body `{ "email", "password" }` → `{ "token" }`. Un solo usuario: las credenciales vienen de `APP_ADMIN_EMAIL` y `APP_ADMIN_PASSWORD`. `401` si no coinciden.

### Productos

#### `GET /api/productos?q=&bajo_stock=bool`
→ `[Producto]` activos, por nombre. `q` busca por nombre o código; `bajo_stock=true` devuelve los de `stock <= stock_minimo`. Un producto con `activo=false` deja de listarse.

#### `POST /api/productos`
Body `{ nombre, precio, iva, stock, stock_minimo, codigo? }` → `Producto` (`201`). `409` si el código ya existe.

#### `PUT /api/productos/{id}`
Body con campos parciales (`nombre, precio, iva, stock, stock_minimo, codigo, activo`) → `Producto`.

#### `POST /api/productos/{id}/entrada`
Body `{ cantidad, nota? }` → `Producto`. Suma stock y registra un movimiento `entrada`.

### Clientes

#### `GET /api/clientes?q=`
→ `[Cliente]`. `q` busca por nombre o documento.

#### `POST /api/clientes`
Body `{ tipo_documento, documento, nombres, telefono?, email?, direccion? }` → `Cliente` (`201`). `409` si ya existe ese tipo y número de documento.

#### `GET /api/clientes/{id}/cartera`
→ `{ cliente, saldo_total, ventas: [{ venta_id, reference_code, total, abonado, saldo, due_date }] }`. Solo ventas de fiado abiertas con saldo pendiente, por fecha de vencimiento.

### Ventas

#### `POST /api/ventas`
Body:
```json
{ "tipo_pago": "efectivo|digital|fiado", "cliente_id": 1,
  "items": [{ "producto_id": 1, "cantidad": 2 }],
  "facturar": false, "due_date": "2026-12-15" }
```
→ `VentaDetalle` (`201`). Reglas en la sección de estados. Líneas repetidas del mismo producto se suman. Errores: `400` si no hay stock suficiente, `404` si el producto (o cliente) no existe, `422` si fiado sin cliente con documento, sin `due_date` o con fecha pasada, o si el total digital queda fuera de 10000–12000000, `502` si no se pudo crear el cobro en Factus Pay (no se guarda la venta).

#### `GET /api/ventas?estado=&cliente_id=`
→ `[VentaResumen]`, más recientes primero.

#### `GET /api/ventas/{id}`
→ `VentaDetalle`.

#### `POST /api/ventas/{id}/refrescar-pago`
Sin body → `VentaDetalle`. Consulta Factus Pay por cada recaudo pendiente y procesa el pago si ya está `paid` (misma lógica que el webhook). Si la factura quedó pendiente, la reintenta.

#### `POST /api/ventas/{id}/abonos`
Body `{ monto }` (entero COP, 10000–12000000) → `VentaDetalle`. Solo ventas `fiado_abierto` (`409` si no); crea un recaudo tipo `abono` (`...-AB1`, `...-AB2`) con su QR. `422` si el monto está fuera de los límites de Pay o supera el saldo.

#### `POST /api/ventas/{id}/nota-credito`
Body `{ concepto: 1|2|5, items?: [{producto_id, cantidad}], monto?: int, observacion? }` → `VentaDetalle`. `items` es obligatorio en el concepto 1 y `monto` en el 5. Requiere factura validada (`409`). Concepto 2 anula la venta y repone el stock. Ver reglas arriba.

#### `POST /api/ventas/{id}/nota-debito`
Body `{ concepto: 1|3|4, items: [{producto_id, cantidad}], observacion? }` → `VentaDetalle`. Requiere factura validada (`409`); `400` si no hay stock. Si la venta fue digital, crea un recaudo tipo `diferencia` (`...-ND1`). Si Factus falla responde `502` y no se guarda nada.

### Webhook

#### `POST /api/webhooks/factus-pay?key=...`
Sin JWT. **Pendiente (otra área).** Debe llamar a `services.ventas.procesar_pago_confirmado(reference_code, db)`, que es idempotente. Factus Pay lo llama solo cuando un recaudo queda `paid` (sin firma HMAC, hasta 6 intentos). `key` se compara en tiempo constante con `FACTUS_PAY_WEBHOOK_KEY` (`401` si no coincide). Guarda el evento en `webhook_eventos`, procesa el pago y responde rápido `2xx` → `{ "ok": true }`.

### Voz

#### `POST /api/voz/interpretar`
Body `{ texto }` →
```json
{ "items": [{ "producto_id": 1, "nombre": "Arroz Diana 500 g", "cantidad": 2, "confianza": 0.93 }],
  "cliente": { "id": 1, "nombres": "Marta Rodríguez" },
  "tipo_pago": "efectivo|digital|fiado|null",
  "no_reconocidos": ["texto que no se pudo mapear"] }
```
`cliente` y `tipo_pago` son `null` si no se mencionan.

### Reportes

#### `GET /api/reportes/resumen`
→ `{ ventas_hoy, total_hoy, fiado_pendiente, productos_bajo_stock: [Producto] }`.

### Solo desarrollo

#### `POST /api/dev/simular-pago/{reference_code}`
Solo existe con `FACTUS_MODE=fake`. Marca el recaudo como pagado en el falso y procesa el pago como lo haría el webhook → `{ "ok": true }`. Con `FACTUS_MODE=real` responde `404`.

## Servicios internos de Factus (frontera entre áreas)

No son endpoints: son las funciones que el núcleo de ventas llama a través de `app.services.pay` y `app.services.facturacion` (reales o falsas según `FACTUS_MODE`). Los tipos están en `backend/app/schemas/factus.py`.

```
pay.crear_recaudo(reference_code, amount: int, expiration=86400) -> RecaudoOut    # amount entre PAY_MIN_AMOUNT y PAY_MAX_AMOUNT
pay.obtener_recaudo(reference_code) -> RecaudoOut
pay.webhook_key_valida(key) -> bool

facturacion.listar_rangos() -> list[dict]
facturacion.crear_factura(reference_code, items, pago, cliente=None) -> DocumentoOut
facturacion.crear_nota_credito(reference_code, factura_numero, concepto, items, pago, cliente=None) -> DocumentoOut
facturacion.crear_nota_debito(reference_code, factura_numero, concepto, items, pago, cliente=None) -> DocumentoOut
```

- `pago` (`PagoFactura`) es **obligatorio** en las tres funciones de documentos: Factus v2 exige `payment_details` también en las notas.
- `cliente=None` significa consumidor final (`13` / `22222222222`) en las tres: Factus exige `customer` también en las notas.
- `DocumentoOut.errores` son avisos de la DIAN, no fallas: `dict` en facturas, lista de textos en notas, o `None`. En las notas Factus devuelve `cude`; `DocumentoOut` lo expone como `cufe`.
- Rango de numeración: se elige el primer rango activo, no vencido y con consecutivos disponibles para cada documento, o el que fuerce `FACTUS_RANGO_FACTURA`, `FACTUS_RANGO_NC` o `FACTUS_RANGO_ND`.
