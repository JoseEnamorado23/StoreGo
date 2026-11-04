from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import Dinero, ORMModel


class ProductoCreate(BaseModel):
    nombre: str
    precio: Dinero = Field(ge=0)  # sin IVA
    iva: Literal[0, 19] = 0
    stock: int = Field(default=0, ge=0)
    stock_minimo: int = Field(default=0, ge=0)
    codigo: str | None = None


class ProductoUpdate(BaseModel):
    nombre: str | None = None
    precio: Dinero | None = Field(default=None, ge=0)
    iva: Literal[0, 19] | None = None
    stock: int | None = Field(default=None, ge=0)
    stock_minimo: int | None = Field(default=None, ge=0)
    codigo: str | None = None
    activo: bool | None = None


class EntradaIn(BaseModel):
    cantidad: int = Field(gt=0)
    nota: str | None = None


class ProductoOut(ORMModel):
    id: int
    codigo: str | None = None
    nombre: str
    precio: Dinero
    iva: int
    stock: int
    stock_minimo: int
    activo: bool
