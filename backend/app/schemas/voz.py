from pydantic import BaseModel

from app.schemas.common import TipoPago


class VozIn(BaseModel):
    texto: str


class VozItem(BaseModel):
    producto_id: int
    nombre: str
    cantidad: int
    confianza: float


class VozCliente(BaseModel):
    id: int
    nombres: str
    # Extensión opcional del contrato: baja (<= 0.5) cuando hay varios clientes parecidos
    confianza: float | None = None


class VozOut(BaseModel):
    items: list[VozItem]
    cliente: VozCliente | None = None
    tipo_pago: TipoPago | None = None
    no_reconocidos: list[str]
    # Extensión opcional del contrato: avisos para el tendero (p. ej. "se usó el analizador de respaldo")
    advertencia: str | None = None
