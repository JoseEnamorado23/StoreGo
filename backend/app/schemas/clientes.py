from datetime import date

from pydantic import BaseModel

from app.schemas.common import Dinero, ORMModel


class ClienteCreate(BaseModel):
    tipo_documento: str  # "13" CC, "31" NIT, ...
    documento: str
    nombres: str
    telefono: str | None = None
    email: str | None = None
    direccion: str | None = None


class ClienteOut(ORMModel):
    id: int
    tipo_documento: str
    documento: str
    nombres: str
    telefono: str | None = None
    email: str | None = None
    direccion: str | None = None


class CarteraVenta(BaseModel):
    venta_id: int
    reference_code: str
    total: Dinero
    abonado: Dinero
    saldo: Dinero
    due_date: date | None = None


class CarteraOut(BaseModel):
    cliente: ClienteOut
    saldo_total: Dinero
    ventas: list[CarteraVenta]
