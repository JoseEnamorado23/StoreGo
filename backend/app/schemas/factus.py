"""Frontera entre el núcleo de ventas y Factus. No cambiar sin avisar al equipo."""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, model_validator


class RecaudoOut(BaseModel):
    reference_code: str
    amount: int  # entero COP
    status: Literal["ready", "paid"]
    breb_key: str | None = None
    qr: str | None = None  # data:image/png;base64,...
    qr_expires_at: str | None = None  # las fechas de Factus no son consistentes: se guardan tal cual
    collected_at: str | None = None


class DocumentoOut(BaseModel):
    tipo: Literal["factura", "nota_credito", "nota_debito"]
    reference_code: str
    numero: str | None = None
    cufe: str | None = None  # en las notas Factus lo llama "cude": se mapea aquí
    is_validated: bool = False
    public_url: str | None = None
    qr_url: str | None = None
    # Avisos de la DIAN, no fallas: dict en facturas, lista de textos en notas
    errores: dict | list | None = None

    @model_validator(mode="before")
    @classmethod
    def _cude_como_cufe(cls, datos):
        if isinstance(datos, dict) and not datos.get("cufe") and datos.get("cude"):
            datos = {**datos, "cufe": datos["cude"]}
        return datos


class ItemFactura(BaseModel):
    codigo: str
    nombre: str
    cantidad: Decimal
    precio: Decimal  # sin IVA
    iva: Literal[0, 19]


class PagoFactura(BaseModel):
    forma: Literal["contado", "credito"]
    metodo_codigo: Literal["10", "47"]  # 10 efectivo, 47 transferencia
    monto: Decimal
    due_date: date | None = None  # obligatorio si forma == "credito"


class ClienteFactura(BaseModel):
    tipo_documento: str  # "13" CC, "31" NIT
    documento: str
    nombres: str
    es_empresa: bool = False
    razon_social: str | None = None
    email: str | None = None
    telefono: str | None = None
    direccion: str | None = None
