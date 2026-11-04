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

## Documentación

- [`AGENTS.md`](AGENTS.md): reglas, convenciones y hechos de las APIs de Factus.
- [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md): contrato de la API.

## Integrantes

Por completar.
