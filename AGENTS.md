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
- Montos de Factus Pay: **enteros en pesos COP**, mínimo 1000, máximo 12100000.
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

### Factus Pay — base `https://pay-api-sandbox.factus.com.co`
- `POST /auth {email, password}` → `{token}`. Un solo token activo por usuario.
- `POST /v1/collections {reference_code, amount, expiration}` (segundos, 86400 por defecto) → **201** al crear o **200** "Recaudo ya existente" si el `reference_code` se repite. `amount` entero COP entre 1000 y 12100000.
- La respuesta trae `data` con `reference_code`, `amount`, `status` (`ready` o `paid`), `breb_key`, `created_at`, `qr_expires_at`, `collected_at` y `qr` (`data:image/png;base64,...`).
- `GET /v1/collections/{reference_code}` consulta el estado.
- Webhook: POST a la URL registrada en el panel con `?key=LLAVE`, **solo cuando el recaudo queda `paid`**, sin firma HMAC, hasta 6 intentos; responde 2xx rápido. Compara la `key` en tiempo constante.
- Los formatos de fecha no son consistentes: **no los parsees de forma estricta**.
- Comisión de 800 pesos más IVA por recaudo. No hay reversos.
- Simulador: https://pay-api-sandbox.factus.com.co/simulator

### Factus Facturación — base `https://api-sandbox.factus.com.co`
- `POST /oauth/token` (form-urlencoded: `grant_type=password`, `client_id`, `client_secret`, `username`, `password`) → `access_token`, `refresh_token`, `expires_in` (la doc dice 1 hora y el ejemplo 600 s): renueva con el `refresh_token` y reintenta **una vez** ante un 401.
- `GET /v2/numbering-ranges?filter[is_active]=1` lista los rangos.
- `POST /v2/bills/validate` factura · `POST /v2/credit-notes/validate` nota crédito · `POST /v2/debit-notes/validate` nota débito.
- `payment_form`: `"1"` contado, `"2"` crédito (con `due_date` `YYYY-MM-DD` obligatorio). `payment_method_code`: `"10"` efectivo, `"47"` transferencia.
- `identification_document_code`: `"13"` cédula, `"31"` NIT. `legal_organization_code`: `"1"` persona jurídica (campo `company`), `"2"` natural (campo `names`).
- Cada item: `code_reference`, `name`, `quantity`, `price` (strings con 2 decimales), `unit_measure_code` `"94"`, `standard_code` `"999"`, `taxes` `[{code: "01", rate: "19.00"}]`.
- Consumidor final: `customer {identification_document_code: "13", identification: "22222222222", names: "Consumidor Final"}`.
- La respuesta trae `data.number`, `data.cufe`, `data.is_validated` y `data.links.public_url`.
- **409** = documento pendiente ante la DIAN: bórralo por su `reference_code` y reenvía.
- Un error con la palabra **"Rechazo"** es un rechazo real; `FAJ44b` y `RUT01` son solo avisos.
- Reenviar un `reference_code` ya procesado devuelve el documento existente.
- Nota crédito: `correction_concept_code` 1 devolución parcial, 2 anulación, 5 descuento por pronto pago; `customization_id` `"20"`; `bill_number` de la factura original.
- Nota débito: concepto 1 intereses, 2 gastos, 3 cambio del valor, 4 otros; `customization_id` `"30"`; `bill_number`.

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
