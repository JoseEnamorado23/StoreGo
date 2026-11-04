# Tienda Fácil

Sistema para tiendas de barrio: registra ventas, controla inventario y fiados, cobra con **Factus Pay** (QR o llave Bre-B) y emite **factura electrónica** con **Factus Facturación**. Proyecto del Reto Factus (solo sandbox).

**Stack:** FastAPI + SQLAlchemy 2 + PostgreSQL 16 · Next.js (App Router) + TypeScript + Tailwind · Docker Compose.

## Cómo levantarlo

```bash
cp .env.example .env
docker compose up --build
```

- Web: http://localhost:3000
- API: http://localhost:8000/api/health (docs en `/docs`)

Con `FACTUS_MODE=fake` funciona sin credenciales de Factus. Para usar el sandbox real, pon `FACTUS_MODE=real` y completa las claves en `.env`.

### Backend local en Windows (sin Docker para la API)

Solo la base de datos va en Docker; la API corre en tu PC. En este modo `DATABASE_URL` del `.env` debe apuntar a `localhost:5435` (puerto publicado en el host), no a `db:5432` (ese host solo existe dentro de la red de Docker).

```powershell
docker compose up -d db
cd backend
python -m venv .venv; .venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

`config.py` busca el `.env` de la raíz con una ruta absoluta, así que funciona desde cualquier carpeta. Si usas `docker compose up` completo, vuelve a poner `@db:5432` en `DATABASE_URL`.

## Documentación

- [`AGENTS.md`](AGENTS.md): reglas, convenciones y hechos de las APIs de Factus.
- [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md): contrato de la API.

## Integrantes

Por completar.
