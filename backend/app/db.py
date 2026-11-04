import time
from collections.abc import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

engine = create_engine(settings.sqlalchemy_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def esperar_db(intentos: int = 30, pausa: float = 1.0) -> None:
    """Espera a que Postgres acepte conexiones (útil al levantar con Docker)."""
    for i in range(intentos):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return
        except Exception:
            if i == intentos - 1:
                raise
            time.sleep(pausa)


def crear_tablas() -> None:
    from app import models  # noqa: F401  (registra los modelos en Base)

    Base.metadata.create_all(engine)
