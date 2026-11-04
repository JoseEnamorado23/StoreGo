# Contrato de la API — Tienda Fácil

Fuente de verdad entre backend y frontend. Si cambias algo aquí, avisa al equipo y actualiza `frontend/lib/types.ts` y los schemas de `backend/app/schemas/`.

## Convenciones

- Prefijo `/api`. JSON en `snake_case`.
- Header `Authorization: Bearer <token>` en todo, **excepto** `GET /api/health`, `POST /api/auth/login` y `POST /api/webhooks/factus-pay`.
- Montos de dinero (precios, totales, saldos) salen como **número** JSON. Los montos de Factus Pay (`recaudos.monto`, `abonos.monto`) son **enteros en pesos COP**: mínimo 1000, máximo 12100000.
- Fechas: ISO 8601 (`due_date` como `YYYY-MM-DD`).
- Errores: `{"detail": "mensaje en español"}` con el código HTTP correspondiente (400, 401, 404, 409, 422...).
- Mientras un área no esté implementada, el endpoint responde `501` con `{"detail": "Pendiente: <área>"}`. Solo `/api/health`, `/api/auth/login` y `/api/dev/*` funcionan desde el inicio.

## Reglas de estado de las ventas

| tipo_pago | Estado inicial | Qué pasa al crear | Qué pasa después |
|---|---|---|---|
| `efectivo` | `pagada` | Descuenta stock. Factura solo si `facturar=true` (consumidor final si no hay cliente). | — |
| `digital` | `esperando_pago` | Crea el recaudo en Factus Pay (tipo `venta`, con QR y llave Bre-B). **No** descuenta stock todavía. | Al confirmarse el pago (webhook o `refrescar-pago`): pasa a `pagada`, descuenta stock y emite la factura (transferencia, código 47). |
| `fiado` | `fiado_abierto` | Requiere `cliente_id` y `due_date`. Descuenta stock y emite de inmediato la factura **a crédito**. | Cada abono es un recaudo tipo `abono`. Cuando la suma de abonos pagados iguala el total, pasa a `fiado_pagado`. |

- `saldo` = `total` − abonos pagados (solo fiado; en los demás tipos es 0 una vez pagada la venta y `total` mientras espera pago).
- **Nota crédito** concepto `2` (anulación): la venta queda `anulada` y se repone el stock. Concepto `1` (devolución parcial, requiere `items`): repone stock de esos items. Concepto `5` (descuento por pronto pago).
- **Nota débito**: si la venta fue `digital`, crea un recaudo tipo `diferencia` por el valor de la nota.
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
                is_validated, public_url|null, factura_origen_id|null, errores|null }
VentaResumen  { id, reference_code, tipo_pago, estado, total (con IVA), cliente_id|null, due_date|null, created_at }
VentaDetalle  VentaResumen + { saldo, cliente: Cliente|null, items: [VentaItem], recaudos: [Recaudo], documentos: [Documento] }
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
→ `[Producto]`. `q` busca por nombre o código; `bajo_stock=true` devuelve los de `stock <= stock_minimo`.

#### `POST /api/productos`
Body `{ nombre, precio, iva, stock, stock_minimo, codigo? }` → `Producto`.

#### `PUT /api/productos/{id}`
Body con campos parciales (`nombre, precio, iva, stock, stock_minimo, codigo, activo`) → `Producto`.

#### `POST /api/productos/{id}/entrada`
Body `{ cantidad, nota? }` → `Producto`. Suma stock y registra un movimiento `entrada`.

### Clientes

#### `GET /api/clientes?q=`
→ `[Cliente]`. `q` busca por nombre o documento.

#### `POST /api/clientes`
Body `{ tipo_documento, documento, nombres, telefono?, email?, direccion? }` → `Cliente`.

#### `GET /api/clientes/{id}/cartera`
→ `{ cliente, saldo_total, ventas: [{ venta_id, reference_code, total, abonado, saldo, due_date }] }`. Solo ventas de fiado con saldo pendiente.

### Ventas

#### `POST /api/ventas`
Body:
```json
{ "tipo_pago": "efectivo|digital|fiado", "cliente_id": 1,
  "items": [{ "producto_id": 1, "cantidad": 2 }],
  "facturar": false, "due_date": "2026-12-15" }
```
→ `VentaDetalle`. Reglas en la sección de estados. Errores: `409` si no hay stock suficiente, `422` si fiado sin cliente o sin `due_date`, o si el total digital queda fuera de 1000–12100000.

#### `GET /api/ventas?estado=&cliente_id=`
→ `[VentaResumen]`, más recientes primero.

#### `GET /api/ventas/{id}`
→ `VentaDetalle`.

#### `POST /api/ventas/{id}/refrescar-pago`
Sin body → `VentaDetalle`. Consulta Factus Pay por cada recaudo pendiente y procesa el pago si ya está `paid` (misma lógica que el webhook).

#### `POST /api/ventas/{id}/abonos`
Body `{ monto }` (entero COP, 1000–12100000) → `VentaDetalle`. Solo ventas `fiado_abierto`; crea un recaudo tipo `abono` (`...-AB1`, `...-AB2`) con su QR. `422` si el monto supera el saldo.

#### `POST /api/ventas/{id}/nota-credito`
Body `{ concepto: 1|2|5, items?: [{producto_id, cantidad}], observacion? }` → `VentaDetalle`. Requiere factura validada. Concepto 2 anula la venta y repone el stock.

#### `POST /api/ventas/{id}/nota-debito`
Body `{ concepto: 1|3|4, items: [{producto_id, cantidad}], observacion? }` → `VentaDetalle`. Si la venta fue digital, crea un recaudo tipo `diferencia`.

### Webhook

#### `POST /api/webhooks/factus-pay?key=...`
Sin JWT. Factus Pay lo llama solo cuando un recaudo queda `paid` (sin firma HMAC, hasta 6 intentos). `key` se compara en tiempo constante con `FACTUS_PAY_WEBHOOK_KEY` (`401` si no coincide). Guarda el evento en `webhook_eventos`, procesa el pago y responde rápido `2xx` → `{ "ok": true }`.

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
