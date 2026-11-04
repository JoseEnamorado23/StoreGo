import os
import warnings

# Variables mínimas antes de importar la app
os.environ.setdefault("APP_ENV", "test")  # distinto de "dev": el seed no corre solo
os.environ.setdefault("APP_ADMIN_EMAIL", "tendero@tienda.local")
os.environ.setdefault("APP_ADMIN_PASSWORD", "clave_de_prueba")
os.environ.setdefault("JWT_SECRET", "secreto_de_prueba_largo_largo_largo")
os.environ.setdefault("DATABASE_URL", "postgresql://tienda:tienda@localhost:5432/tienda")
os.environ.setdefault("FACTUS_MODE", "fake")
os.environ.setdefault("FACTUS_PAY_WEBHOOK_KEY", "llave_de_prueba_de_32_caracteres_o_mas")
os.environ.setdefault("REFERENCE_PREFIX", "TFXX")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import SAWarning
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

warnings.filterwarnings("ignore", category=SAWarning)  # SQLite no guarda Decimal nativo; en Postgres sí


@pytest.fixture
def sesion(monkeypatch):
    """Fábrica de sesiones sobre una base SQLite en memoria, limpia en cada prueba.
    También reemplaza SessionLocal del servicio (lo usa procesar_pago_confirmado sin db)."""
    from app import db as app_db
    from app.main import app
    from app.services import fakes, ventas

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    app_db.Base.metadata.create_all(engine)
    fabrica = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    monkeypatch.setattr(ventas, "SessionLocal", fabrica)

    def _get_db():
        s = fabrica()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[app_db.get_db] = _get_db
    fakes.PAGADOS.clear()
    fakes._recaudos.clear()
    fakes._documentos.clear()
    yield fabrica
    app.dependency_overrides.clear()
    engine.dispose()


@pytest.fixture
def api(sesion):
    """TestClient autenticado contra la app con la base de pruebas."""
    from app.main import app

    cliente = TestClient(app)
    r = cliente.post(
        "/api/auth/login",
        json={"email": os.environ["APP_ADMIN_EMAIL"], "password": os.environ["APP_ADMIN_PASSWORD"]},
    )
    cliente.headers["Authorization"] = f"Bearer {r.json()['token']}"
    return cliente
