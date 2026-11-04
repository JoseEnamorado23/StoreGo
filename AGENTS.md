# AGENTS.md — léelo primero

## 1. Qué es esto

**Tienda Fácil**: sistema para tiendas de barrio. Registra ventas, controla inventario y fiados, cobra con **Factus Pay** (QR o llave Bre-B) y emite **factura electrónica** con la API de **Factus Facturación**. Es nuestro proyecto del Reto Factus (hackatón de 2 días).

Reglas del reto:
- Integrar **de verdad** Factus Facturación y Factus Pay.
- Solo **sandbox**, sin dinero real. Nada de pasarelas externas.
- Todo el código se escribe **durante el evento**.
- **Cada integrante debe poder explicar el código** que entrega.

Entregables: repositorio público con README y `.env.example`, demo desplegada, video de 2 a 3 minutos y pitch de 5 minutos.

## 2. Convenciones

- Nombres de dominio en **español** (`ventas`, `productos`, `recaudos`...). Tablas y campos en `snake_case`.
- JSON de la API en **snake_case**. El contrato está en `docs/API_CONTRACT.md`; si lo cambias, actualiza también `backend/app/schemas/` y `frontend/lib/types.ts`.
- `reference_code` (prefijo `REFERENCE_PREFIX`, único por equipo porque los sandboxes pueden ser compartidos):
  - Venta y su factura: `{PREFIJO}-VENTA-0007`
  - Abono de un fiado: `{PREFIJO}-VENTA-0007-AB1`
  - Recaudo de la diferencia de una nota débito: `{PREFIJO}-VENTA-0007-ND1`
  - Nota crédito / nota débito: `{PREFIJO}-NC-0007-1` / `{PREFIJO}-ND-0007-1`
- Montos de Factus Pay: **enteros en pesos COP**, mínimo 10000, máximo 12000000 (configurables con `PAY_MIN_AMOUNT` y `PAY_MAX_AMOUNT`).
- Errores con `HTTPException` y **mensajes en español**.

## 3. Seguridad

- Ninguna clave en el código ni en commits. Solo valores falsos en `.env.example`; el `.env` real está en `.gitignore`.
- El frontend **nunca** llama a Factus: solo al backend.
- El token de Factus Pay es **único por usuario** (cada login revoca el anterior): pídelo una vez, guárdalo en memoria y reutilízalo. Si lo pides en cada petición se invalidan entre sí.

## 4. Git

- **No ejecutes `git commit`, `git push` ni agregues líneas `Co-Authored-By`.** Los commits los hace la persona del equipo.
- Trabaja **solo en los archivos de tu área**:

| Área | Edita | No toques |
|---|---|---|
| Núcleo de ventas | `backend/app/services/ventas.py`, `routers/ventas.py`, `routers/webhooks.py`, `routers/dev.py`, `models.py`, `schemas/ventas.py` | servicios de Factus |
| Factus Pay | `services/factus_pay.py`, `services/fakes.py` (parte de Pay), `schemas/factus.py` (RecaudoOut) | resto |
| Factus Facturación | `services/factus_facturacion.py`, `services/fakes.py` (parte de facturación), `schemas/factus.py` (DocumentoOut, ItemFactura, PagoFactura, ClienteFactura) | resto |
| Inventario, clientes y reportes | `routers/productos.py`, `routers/clientes.py`, `routers/reportes.py`, `schemas/productos.py`, `schemas/clientes.py` | resto |
| Voz | `services/voz.py`, `routers/voz.py`, `schemas/voz.py` | resto |
| Frontend | `frontend/**` | `backend/**` |
| Docs y deploy | `README.md`, `docs/**`, `deploy/**`, `docker-compose.yml` | código |

Las firmas de `services/factus_pay.py` y `services/factus_facturacion.py` son la frontera entre áreas: no las cambies sin avisar.

## 5. Hechos verificados de las APIs de Factus

Verificados contra el sandbox con `scripts/probar_pay.py` y `scripts/probar_facturacion.py`. Las peticiones y respuestas reales (sin secretos) están en `docs/payloads/`. Lo marcado **[no verificado]** viene de la documentación o de una referencia de terceros y no se ha probado.

### Factus Pay — base `https://pay-api-sandbox.factus.com.co`
- Enviar siempre `Accept: application/json`. Sin él, los errores de validación responden `302` con HTML.
- `POST /auth {email, password}` → `200 {token}`. Credenciales malas: `401 {"message": "Credenciales inválidas"}`. Un solo token activo por usuario: cada login revoca el anterior.
- `POST /v1/collections {reference_code, amount, expiration}` (segundos, 86400 por defecto):
  - Crear → **200** `"Recaudo asignado y QR generado correctamente"` (no 201).
  - Repetir el `reference_code` → **200** `"Recaudo ya existente"`, con los mismos datos.
  - **`amount` entero COP entre 10000 y 12000000.** Fuera de rango → `422` con mensaje en inglés (`The amount field must be at least 10000.`).
- Todas las respuestas vienen envueltas: `{"data": {...}, "status": "success", "message": "..."}`. `data` trae `reference_code`, `amount`, `status` (`ready` o `paid`), `breb_key` (ej. `@FC8UL6IPPXOA9QB6X48P`), `created_at`, `qr_expires_at` (creación + 24 h), `collected_at` (null mientras está `ready`) y `qr` (`data:image/png;base64,...`, unos 16 KB).
- Las fechas llegan como `04-11-2026 11:21:16 AM` (día-mes-año, 12 h): **no las parsees de forma estricta**.
- `GET /v1/collections/{reference_code}` → `200 "Recaudo encontrado"`; si no existe → `404 "Recaudo no encontrado"`.
- Al pagar el recaudo en el simulador (https://pay-api-sandbox.factus.com.co/simulator), el mismo `GET` devuelve `status: "paid"` y `collected_at` con fecha (`04-11-2026 11:36:22 AM`); el resto de campos (`breb_key`, `qr`, `qr_expires_at`) no cambia. Ver `docs/payloads/pay_consulta_paid.json`.
- Webhook: POST a la URL registrada en el panel con `?key=LLAVE`, solo cuando el recaudo queda `paid`, sin firma HMAC, hasta 6 intentos; responde 2xx rápido y compara la `key` en tiempo constante. **[no verificado]** (viene de la documentación).
- Comisión de 800 pesos más IVA por recaudo y no hay reversos. **[no verificado]**

### Factus Facturación — base `https://api-sandbox.factus.com.co`
- `POST /oauth/token` (form-urlencoded: `grant_type=password`, `client_id`, `client_secret`, `username`, `password`) → `200 {token_type, expires_in: 3600, access_token, refresh_token}`. Credenciales malas: `400 "The user credentials were incorrect."`. La renovación con `refresh_token` y el reintento ante 401 **[no verificado]**: el token estaba recién emitido.
- Enviar `Accept: application/json`.
- `GET /v2/numbering-ranges?filter[is_active]=1` → `data` es una lista con `id`, `document`, `prefix`, `current`, `to`, `resolution_number`. En nuestra cuenta: Factura de Venta id `389` (`SETP`), Nota Crédito ids `1776` (`CRTE`) y `390` (`NC`), Nota Débito id `391` (`ND`). Los ids dependen de la cuenta: léelos de este endpoint, no los fijes en el código. Se enviaron siempre con `numbering_range_id`; omitirlo **[no verificado]**.
- Endpoints: `POST /v2/bills/validate`, `POST /v2/credit-notes/validate`, `POST /v2/debit-notes/validate`. Crear bien → **201**.
- **El pago va en `payment_details`** (obligatorio; los campos `payment_form` y `payment_method_code` sueltos ya no sirven): `[{"payment_form": "1"|"2", "payment_method_code": "10"|"47", "amount": "36270.00", "due_date": "YYYY-MM-DD"}]`. `"1"` contado, `"2"` crédito (`due_date` obligatorio solo en crédito; error `payment_details.0.due_date`). `amount` es el total con IVA. Métodos: `"10"` efectivo, `"47"` transferencia.
- Cliente: `identification_document_code` `"13"` cédula / `"31"` NIT; `legal_organization_code` `"2"` natural (campo `names`) / `"1"` jurídica (campo `company`) **[no verificado el caso jurídica]**. Consumidor final: `{identification_document_code: "13", identification: "22222222222", names: "Consumidor Final"}` funciona en facturas y notas.
- Items: `code_reference`, `name`, `quantity`, `price` (string con 2 decimales), `unit_measure_code` `"94"`, `standard_code` `"999"`, `taxes`. **`taxes` es obligatorio también con IVA 0**: IVA 19 → `[{code: "01", rate: "19.00"}]`; **IVA 0 → `[{code: "01", rate: "0.00"}]`**. Sin `taxes`, o solo con `is_excluded: 1`, responde `422 items.0.taxes obligatorio`.
- Respuesta de factura (`data`): `number` (prefijo + consecutivo, ej. `SETP990033341`), `cufe`, `is_validated`, `errors`, `links.public_url`, `links.qr`, `totals`, `payment_details`.
- Respuesta de nota (`data`): `number` (ej. `CRTE1396`, `ND462`), **`cude`** (no `cufe`), `is_validated`, `errors`, `links`, y `bill {reference_code, number, cufe}` que enlaza con la factura original.
- **`data.errors` son avisos, no fallas, aunque `is_validated` sea true.** En facturas es un **dict** (`FAK08`, `RUT01`, `FAJ44b`, `FAJ43b`) y en notas una **lista de textos** (`CAK28`, `CBF02`, `RUT01`, `CAK55`...). Nuestro `DocumentoOut.errores` hoy es `dict | None` y debe aceptar también lista.
- Reenviar un `reference_code` ya procesado → `201` con el mismo documento (mismo `number`); no duplica.
- Errores de validación: `422 {"status": "Validation error", "message": "Error de validación", "data": {"message": ..., "errors": {"campo": ["mensaje en español"]}}}`.
- Nota crédito: `correction_concept_code` 1 devolución parcial, 2 anulación, 5 descuento por pronto pago; `customization_id` `"20"`; `bill_number` de la factura original (si no existe → `422 bill_number: "La factura referenciada no existe."`); exige `customer` y `payment_details`. Probados conceptos 1 y 2 → 201. El concepto 5 **[no verificado]**.
- Nota débito: `customization_id` `"30"`, `bill_number`, `customer`, `payment_details`. Probado concepto 3 (sobre una factura a crédito) → 201. Los conceptos 1, 2 y 4 **[no verificado]**.
- **Borrar un documento pendiente:** `DELETE /v2/bills/destroy/reference/{reference_code}`. Con un código inexistente → `404 "No se encontró el documento con código de referencia ..."`. `/v1/...` da `403 "Version de API no disponible para esta empresa"`; `/v2/bills/{ref}` y `/v2/bills/reference/{ref}` dan `405`. No se probó con un documento realmente pendiente.
- **[no verificado]** El `409` (documento pendiente ante la DIAN) y el error "Rechazo" no se pudieron reproducir. Se mantiene el criterio: un error con la palabra "Rechazo" es un rechazo real; `FAJ44b`, `FAJ43b`, `FAK08`, `RUT01`, `CAK28`, `CBF02` son solo avisos.

## 6. Cómo correr y mapa de carpetas

```bash
cp .env.example .env        # y ajusta los valores
docker compose up --build   # db :5432, backend :8000, frontend :3000
```
- API: http://localhost:8000/api/health · docs interactivas: http://localhost:8000/docs
- Web: http://localhost:3000
- Con `FACTUS_MODE=fake` (por defecto) no hace falta ninguna credencial de Factus; `POST /api/dev/simular-pago/{reference_code}` simula el pago.
- Tests del backend: `docker compose exec backend python -m pytest`

```
AGENTS.md  README.md  .env.example  docker-compose.yml
docs/            API_CONTRACT.md, payloads/ (ejemplos reales de requests/responses de Factus)
deploy/          plantillas de producción (compose + Caddyfile)
scripts/         utilidades sueltas
backend/app/
  main.py config.py db.py security.py models.py
  schemas/       contratos Pydantic (common, productos, clientes, ventas, factus, voz)
  routers/       endpoints HTTP (auth, productos, clientes, ventas, reportes, webhooks, voz, dev)
  services/      lógica: ventas.py (núcleo), factus_pay.py, factus_facturacion.py, fakes.py, voz.py
backend/tests/
frontend/        Next.js: app/ (páginas), components/, lib/ (api.ts, types.ts, mocks.ts)
```
