from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import crear_tablas, esperar_db
from app.routers import auth, clientes, productos, reportes, ventas, voz, webhooks
from app.schemas.common import HealthOut
from app.security import usuario_actual


@asynccontextmanager
async def lifespan(app: FastAPI):
    esperar_db()
    crear_tablas()
    yield


app = FastAPI(title="Tienda Fácil API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthOut, tags=["health"])
def health() -> HealthOut:
    return HealthOut(status="ok", factus_mode=settings.factus_mode)


# Sin JWT: login y webhook
app.include_router(auth.router)
app.include_router(webhooks.router)

# Con JWT
protegido = [Depends(usuario_actual)]
for modulo in (productos, clientes, ventas, reportes, voz):
    app.include_router(modulo.router, dependencies=protegido)

if settings.factus_mode == "fake":
    from app.routers import dev

    app.include_router(dev.router)
