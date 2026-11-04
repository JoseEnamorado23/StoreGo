"""Núcleo de ventas. Las reglas de estado están en docs/API_CONTRACT.md.

Factus se usa solo a través de `pay` y `facturacion` (reales o falsos según FACTUS_MODE).
Las funciones que reciben `db` usan la sesión del request. `procesar_pago_confirmado` también
puede llamarse solo con el reference_code (abre su propia sesión) porque la usan el webhook y el
simulador de dev, que no tienen un request autenticado.

Convención de dinero: los valores se guardan con IVA en Numeric(12,2); lo que se envía a Factus Pay
es el total redondeado a pesos enteros. El stock de `movimientos_inventario` va con signo
(venta -n, devolucion +n, entrada +n).
"""

from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.models import (
    Cliente,
    DocumentoElectronico,
    MovimientoInventario,
    Producto,
    Recaudo,
    Venta,
    VentaItem,
)
from app.schemas.clientes import CarteraOut, CarteraVenta, ClienteOut
from app.schemas.factus import ClienteFactura, DocumentoOut, ItemFactura, PagoFactura, RecaudoOut as RecaudoFactus
from app.schemas.productos import ProductoOut
from app.schemas.ventas import (
    AbonoIn,
    DocumentoVentaOut,
    ItemIn,
    NotaCreditoIn,
    NotaDebitoIn,
    RecaudoOut,
    ResumenOut,
    VentaCreate,
    VentaDetalle,
    VentaItemOut,
)
from app.services import facturacion, pay

CENTAVOS = Decimal("0.01")
BOGOTA = timezone(timedelta(hours=-5))  # Colombia no tiene horario de verano
ESTADOS_CON_VENTA = ("pagada", "fiado_abierto", "fiado_pagado")


# ---- Utilidades ----------------------------------------------------------------


def _dec(valor) -> Decimal:
    return Decimal(str(valor if valor is not None else 0))


def _d(valor) -> Decimal:
    return _dec(valor).quantize(CENTAVOS, ROUND_HALF_UP)


def _valor_linea(precio, iva: int, cantidad) -> Decimal:
    """Valor de una línea con IVA."""
    return _d(_dec(precio) * _dec(cantidad) * (1 + Decimal(iva) / 100))


def _a_monto_pay(valor: Decimal) -> int:
    return int(valor.to_integral_value(ROUND_HALF_UP))


def _cop(n) -> str:
    return "$" + f"{int(n):,}".replace(",", ".")


def _exigir_monto_pay(monto: int, que: str) -> None:
    if not settings.pay_min_amount <= monto <= settings.pay_max_amount:
        raise HTTPException(
            status_code=422,
            detail=(
                f"{que} ({_cop(monto)}) debe estar entre {_cop(settings.pay_min_amount)} "
                f"y {_cop(settings.pay_max_amount)} para cobrarse con Factus Pay"
            ),
        )


def _motivo(e: Exception) -> str:
    if isinstance(e, HTTPException):
        return str(e.detail)
    if isinstance(e, NotImplementedError):
        return "el servicio de facturación aún no está disponible"
    return str(e) or e.__class__.__name__


def _resumen_errores(errores) -> str:
    if isinstance(errores, dict):
        return "; ".join(f"{k}: {v}" for k, v in list(errores.items())[:3])
    if isinstance(errores, list):
        return "; ".join(str(x) for x in errores[:3])
    return "sin detalle"


_FORMATOS_FECHA = ("%d-%m-%Y %I:%M:%S %p", "%d-%m-%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S")


def _fecha_laxa(texto) -> datetime | None:
    """Las fechas de Factus Pay no son consistentes ('04-11-2026 11:21:16 AM'): se intenta y, si no se puede, None."""
    if not texto:
        return None
    limpio = str(texto).strip()
    for formato in _FORMATOS_FECHA:
        try:
            return datetime.strptime(limpio, formato).replace(tzinfo=BOGOTA)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(limpio)
    except ValueError:
        return None


def _consolidar(items: list[ItemIn]) -> dict[int, int]:
    """Une líneas repetidas del mismo producto."""
    pedido: dict[int, int] = {}
    for it in items:
        pedido[it.producto_id] = pedido.get(it.producto_id, 0) + it.cantidad
    return pedido


def _cargar_venta(db: Session, venta_id: int, bloquear: bool = False) -> Venta:
    consulta = select(Venta).where(Venta.id == venta_id)
    if bloquear:
        consulta = consulta.with_for_update()
    venta = db.scalar(consulta)
    if venta is None:
        raise HTTPException(status_code=404, detail="La venta no existe")
    return venta


def _productos_bloqueados(db: Session, ids: list[int]) -> dict[int, Producto]:
    filas = db.scalars(select(Producto).where(Producto.id.in_(ids)).order_by(Producto.id).with_for_update()).all()
    return {p.id: p for p in filas}


def _mover_stock(db: Session, producto: Producto, cantidad: int, tipo: str, venta_id: int | None, nota: str | None = None):
    """cantidad con signo: negativa descuenta, positiva repone."""
    producto.stock += cantidad
    db.add(MovimientoInventario(producto_id=producto.id, venta_id=venta_id, tipo=tipo, cantidad=cantidad, nota=nota))


# ---- Factus: traducción de datos --------------------------------------------------


def _cliente_factura(cliente: Cliente | None) -> ClienteFactura | None:
    """None = consumidor final (lo resuelve el servicio de facturación)."""
    if cliente is None:
        return None
    es_empresa = cliente.tipo_documento == "31"
    return ClienteFactura(
        tipo_documento=cliente.tipo_documento,
        documento=cliente.documento,
        nombres=cliente.nombres,
        es_empresa=es_empresa,
        razon_social=cliente.nombres if es_empresa else None,
        email=cliente.email,
        telefono=cliente.telefono,
        direccion=cliente.direccion,
    )


def _item_factura(db: Session, item: VentaItem, cantidad, precio=None, nombre: str | None = None) -> ItemFactura:
    producto = db.get(Producto, item.producto_id)
    codigo = (producto.codigo if producto and producto.codigo else None) or f"P{item.producto_id}"
    return ItemFactura(
        codigo=codigo,
        nombre=nombre or item.nombre,
        cantidad=_dec(cantidad),
        precio=_d(item.precio if precio is None else precio),
        iva=item.iva,
    )


def _metodo(venta: Venta) -> str:
    return "10" if venta.tipo_pago == "efectivo" else "47"


def _pago_factura(venta: Venta) -> PagoFactura:
    if venta.tipo_pago == "fiado":
        return PagoFactura(forma="credito", metodo_codigo="47", monto=_d(venta.total), due_date=venta.due_date)
    return PagoFactura(forma="contado", metodo_codigo=_metodo(venta), monto=_d(venta.total))


def _pago_nota(venta: Venta, monto: Decimal) -> PagoFactura:
    """Las notas se envían de contado con el método de la venta (combinación verificada en el sandbox)."""
    return PagoFactura(forma="contado", metodo_codigo=_metodo(venta), monto=_d(monto))


def _copiar_documento(fila: DocumentoElectronico, doc: DocumentoOut, monto: Decimal) -> None:
    fila.reference_code = doc.reference_code
    fila.numero = doc.numero
    fila.cufe = doc.cufe
    fila.is_validated = doc.is_validated
    fila.public_url = doc.public_url
    fila.errores = doc.errores
    fila.monto = _d(monto)


def _factura_de(venta: Venta) -> DocumentoElectronico | None:
    return next((d for d in venta.documentos if d.tipo == "factura"), None)


def _factura_validada(venta: Venta) -> DocumentoElectronico:
    factura = _factura_de(venta)
    if factura is None or not factura.is_validated or not factura.numero:
        raise HTTPException(
            status_code=409,
            detail="La venta no tiene una factura electrónica validada; si quedó pendiente, usa «Refrescar pago» para reintentar",
        )
    return factura


async def _facturar(db: Session, venta: Venta) -> None:
    """Emite (o reintenta) la factura. Si Factus falla la venta se conserva y queda marcada para reintentar."""
    try:
        items = [_item_factura(db, vi, vi.cantidad) for vi in venta.items]
        doc = await facturacion.crear_factura(
            venta.reference_code, items, _pago_factura(venta), _cliente_factura(venta.cliente)
        )
    except Exception as e:
        venta.factura_pendiente = True
        venta.factura_error = (
            f"No se pudo emitir la factura electrónica ({_motivo(e)}). "
            "La venta quedó registrada; reintenta con «Refrescar pago»."
        )
        return
    fila = _factura_de(venta)
    if fila is None:
        fila = DocumentoElectronico(tipo="factura", reference_code=venta.reference_code)
        venta.documentos.append(fila)
    _copiar_documento(fila, doc, venta.total)
    if doc.is_validated:
        venta.factura_pendiente, venta.factura_error = False, None
    else:
        venta.factura_pendiente = True
        venta.factura_error = (
            f"Factus no validó la factura ({_resumen_errores(doc.errores)}). "
            "La venta quedó registrada; reintenta con «Refrescar pago»."
        )


# ---- Saldo y estado ------------------------------------------------------------------


def _saldo(venta: Venta) -> Decimal:
    if venta.estado == "anulada":
        return Decimal("0.00")
    abonos = sum((_dec(r.monto) for r in venta.recaudos if r.tipo == "abono" and r.estado == "paid"), Decimal(0))
    if venta.tipo_pago == "fiado":
        debitos = sum((_dec(d.monto) for d in venta.documentos if d.tipo == "nota_debito"), Decimal(0))
        creditos = sum((_dec(d.monto) for d in venta.documentos if d.tipo == "nota_credito"), Decimal(0))
        return max(Decimal("0.00"), _d(_dec(venta.total) + debitos - creditos - abonos))
    if venta.estado == "esperando_pago":
        return _d(venta.total)
    pendiente = sum((_dec(r.monto) for r in venta.recaudos if r.tipo == "diferencia" and r.estado == "ready"), Decimal(0))
    return _d(pendiente)


def _devolver_manual(venta: Venta) -> int | None:
    """Lo cobrado por QR que sobra frente a lo que finalmente se debe: Factus Pay no hace reversos."""
    cobrado = sum(r.monto for r in venta.recaudos if r.estado == "paid")
    if cobrado <= 0:
        return None
    debitos = sum((_dec(d.monto) for d in venta.documentos if d.tipo == "nota_debito"), Decimal(0))
    creditos = sum((_dec(d.monto) for d in venta.documentos if d.tipo == "nota_credito"), Decimal(0))
    sobra = Decimal(cobrado) - (_dec(venta.total) + debitos - creditos)
    return _a_monto_pay(sobra) if sobra > 0 else None


def _reevaluar_fiado(venta: Venta) -> None:
    if venta.tipo_pago != "fiado" or venta.estado not in ("fiado_abierto", "fiado_pagado"):
        return
    saldo = _saldo(venta)
    if saldo <= 0 and venta.estado == "fiado_abierto":
        venta.estado = "fiado_pagado"
    elif saldo > 0 and venta.estado == "fiado_pagado":
        venta.estado = "fiado_abierto"


def calcular_saldo(db: Session, venta_id: int) -> Decimal:
    """Lo que falta por cobrar. Fiado: total + notas débito − notas crédito − abonos pagados.
    Digital: total mientras espera el pago, luego solo diferencias pendientes. Anulada: 0."""
    return _saldo(_cargar_venta(db, venta_id))


def detalle(venta: Venta) -> VentaDetalle:
    return VentaDetalle(
        id=venta.id,
        reference_code=venta.reference_code,
        tipo_pago=venta.tipo_pago,
        estado=venta.estado,
        total=_d(venta.total),
        cliente_id=venta.cliente_id,
        due_date=venta.due_date,
        created_at=venta.created_at,
        saldo=_saldo(venta),
        factura_pendiente=bool(venta.factura_pendiente),
        factura_error=venta.factura_error,
        devolver_manual=_devolver_manual(venta),
        cliente=ClienteOut.model_validate(venta.cliente) if venta.cliente else None,
        items=[VentaItemOut.model_validate(i) for i in venta.items],
        recaudos=[RecaudoOut.model_validate(r) for r in venta.recaudos],
        documentos=[DocumentoVentaOut.model_validate(d) for d in venta.documentos],
    )


# ---- Consultas -------------------------------------------------------------------------


def obtener_venta(db: Session, venta_id: int) -> Venta:
    return _cargar_venta(db, venta_id)


def listar_ventas(db: Session, estado: str | None = None, cliente_id: int | None = None) -> list[Venta]:
    consulta = select(Venta).order_by(Venta.created_at.desc(), Venta.id.desc())
    if estado:
        consulta = consulta.where(Venta.estado == estado)
    if cliente_id is not None:
        consulta = consulta.where(Venta.cliente_id == cliente_id)
    return list(db.scalars(consulta).all())


# ---- Crear venta -------------------------------------------------------------------------


def _recaudo_desde(tipo: str, monto: int, remoto: RecaudoFactus) -> Recaudo:
    return Recaudo(
        reference_code=remoto.reference_code,
        tipo=tipo,
        monto=monto,
        estado=remoto.status,
        breb_key=remoto.breb_key,
        qr=remoto.qr,
        qr_expires_at=_fecha_laxa(remoto.qr_expires_at),
        collected_at=_fecha_laxa(remoto.collected_at),
    )


async def _crear_recaudo(db: Session, reference_code: str, monto: int, tipo: str) -> Recaudo:
    try:
        remoto = await pay.crear_recaudo(reference_code, monto)
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=502, detail=f"No se pudo crear el cobro en Factus Pay: {_motivo(e)}")
    return _recaudo_desde(tipo, monto, remoto)


async def crear_venta(db: Session, datos: VentaCreate) -> Venta:
    """Crea la venta con su reference_code {PREFIJO}-VENTA-NNNN.

    - efectivo: estado "pagada", descuenta stock (y factura si facturar=True).
    - digital: estado "esperando_pago", crea el recaudo (monto entero COP); el stock se descuenta al pagarse.
    - fiado: estado "fiado_abierto", descuenta stock y factura a crédito (requiere cliente y due_date).
    """
    pedido = _consolidar(datos.items)

    cliente = None
    if datos.cliente_id is not None:
        cliente = db.get(Cliente, datos.cliente_id)
        if cliente is None:
            raise HTTPException(status_code=404, detail="El cliente no existe")
    if datos.tipo_pago == "fiado":
        if cliente is None or not cliente.documento.strip():
            raise HTTPException(status_code=422, detail="Una venta fiada necesita un cliente con documento")
        if datos.due_date is None:
            raise HTTPException(status_code=422, detail="Una venta fiada necesita fecha de vencimiento (due_date)")
        if datos.due_date < datetime.now(BOGOTA).date():
            raise HTTPException(status_code=422, detail="La fecha de vencimiento no puede estar en el pasado")

    productos = _productos_bloqueados(db, list(pedido))
    for pid, cantidad in pedido.items():
        p = productos.get(pid)
        if p is None or not p.activo:
            raise HTTPException(status_code=404, detail=f"El producto {pid} no existe o está inactivo")
        if p.stock < cantidad:
            raise HTTPException(
                status_code=400, detail=f"Stock insuficiente de «{p.nombre}»: hay {p.stock} y se piden {cantidad}"
            )

    total = _d(sum((_valor_linea(productos[pid].precio, productos[pid].iva, c) for pid, c in pedido.items()), Decimal(0)))
    if datos.tipo_pago == "digital":
        _exigir_monto_pay(_a_monto_pay(total), "El total de la venta")

    estado = {"efectivo": "pagada", "digital": "esperando_pago", "fiado": "fiado_abierto"}[datos.tipo_pago]
    venta = Venta(
        reference_code=f"TMP-{uuid4().hex}",  # se reemplaza al tener el id
        cliente_id=cliente.id if cliente else None,
        tipo_pago=datos.tipo_pago,
        estado=estado,
        total=total,
        due_date=datos.due_date if datos.tipo_pago == "fiado" else None,
    )
    db.add(venta)
    db.flush()
    venta.reference_code = f"{settings.reference_prefix}-VENTA-{venta.id:04d}"
    for pid, cantidad in pedido.items():
        p = productos[pid]
        venta.items.append(VentaItem(producto_id=pid, nombre=p.nombre, cantidad=cantidad, precio=p.precio, iva=p.iva))

    if datos.tipo_pago == "digital":
        venta.recaudos.append(await _crear_recaudo(db, venta.reference_code, _a_monto_pay(total), "venta"))
    else:
        for pid, cantidad in pedido.items():
            _mover_stock(db, productos[pid], -cantidad, "venta", venta.id)
        if datos.tipo_pago == "fiado" or datos.facturar:
            await _facturar(db, venta)

    db.commit()
    return venta


# ---- Pagos de Factus Pay ------------------------------------------------------------------


async def procesar_pago_confirmado(reference_code: str, db: Session | None = None) -> bool:
    """Procesa un recaudo pagado. Idempotente: puede llegar repetido por el webhook.

    Sin `db` abre su propia sesión. Confirma con Factus Pay que el recaudo está paid y que el monto
    coincide antes de actuar. Devuelve True si procesó el pago ahora, False si ya estaba procesado
    o Factus Pay aún no lo marca como pagado.
    - venta: pasa a "pagada", descuenta stock y emite la factura de contado (transferencia, 47).
    - abono: recalcula el saldo y pasa a "fiado_pagado" si se completa.
    - diferencia: queda registrado el pago de la nota débito.
    """
    if db is None:
        with SessionLocal() as propia:
            return await procesar_pago_confirmado(reference_code, propia)

    recaudo = db.scalar(select(Recaudo).where(Recaudo.reference_code == reference_code).with_for_update())
    if recaudo is None:
        raise HTTPException(status_code=404, detail="No existe un recaudo con ese código de referencia")
    if recaudo.estado == "paid":
        return False

    remoto = await pay.obtener_recaudo(reference_code)
    if remoto.status != "paid":
        return False
    if remoto.amount != recaudo.monto:
        raise HTTPException(
            status_code=409,
            detail=f"El monto cobrado ({_cop(remoto.amount)}) no coincide con el esperado ({_cop(recaudo.monto)})",
        )

    recaudo.estado = "paid"
    recaudo.collected_at = _fecha_laxa(remoto.collected_at) or datetime.now(timezone.utc)
    venta = _cargar_venta(db, recaudo.venta_id, bloquear=True)

    if recaudo.tipo == "venta":
        if venta.estado == "esperando_pago":
            venta.estado = "pagada"
            productos = _productos_bloqueados(db, [i.producto_id for i in venta.items])
            for item in venta.items:
                # El dinero ya se cobró: el stock puede quedar negativo antes que perder el pago
                _mover_stock(db, productos[item.producto_id], -item.cantidad, "venta", venta.id)
            await _facturar(db, venta)
    elif recaudo.tipo == "abono":
        _reevaluar_fiado(venta)
    # tipo diferencia: basta con marcarlo pagado (el saldo y devolver_manual lo reflejan)

    db.commit()
    return True


async def refrescar_pago(db: Session, venta_id: int) -> Venta:
    """Respaldo del webhook: consulta Factus Pay por cada recaudo en ready y procesa los ya pagados.
    También reintenta la factura si quedó pendiente."""
    venta = _cargar_venta(db, venta_id)
    for recaudo in [r for r in venta.recaudos if r.estado == "ready"]:
        await procesar_pago_confirmado(recaudo.reference_code, db)
    db.refresh(venta)
    if venta.factura_pendiente and venta.estado in ESTADOS_CON_VENTA:
        await _facturar(db, venta)
        db.commit()
    return venta


# ---- Fiado ---------------------------------------------------------------------------------


async def crear_abono(db: Session, venta_id: int, datos: AbonoIn) -> Venta:
    """Crea un recaudo tipo abono ({REF}-AB{n}) con su QR para una venta de fiado."""
    venta = _cargar_venta(db, venta_id, bloquear=True)
    if venta.tipo_pago != "fiado" or venta.estado != "fiado_abierto":
        raise HTTPException(status_code=409, detail="Solo se puede abonar a una venta fiada que siga abierta")
    _exigir_monto_pay(datos.monto, "El abono")
    saldo = _saldo(venta)
    if datos.monto > saldo:
        raise HTTPException(
            status_code=422, detail=f"El abono ({_cop(datos.monto)}) no puede superar el saldo ({_cop(saldo)})"
        )
    n = 1 + sum(1 for r in venta.recaudos if r.tipo == "abono")
    venta.recaudos.append(await _crear_recaudo(db, f"{venta.reference_code}-AB{n}", datos.monto, "abono"))
    db.commit()
    return venta


def cartera(db: Session, cliente_id: int) -> CarteraOut:
    cliente = db.get(Cliente, cliente_id)
    if cliente is None:
        raise HTTPException(status_code=404, detail="El cliente no existe")
    abiertas = db.scalars(
        select(Venta)
        .where(Venta.cliente_id == cliente_id, Venta.tipo_pago == "fiado", Venta.estado == "fiado_abierto")
        .order_by(Venta.due_date, Venta.id)
    ).all()
    filas = []
    for v in abiertas:
        saldo = _saldo(v)
        if saldo <= 0:
            continue
        abonado = sum((_dec(r.monto) for r in v.recaudos if r.tipo == "abono" and r.estado == "paid"), Decimal(0))
        filas.append(
            CarteraVenta(
                venta_id=v.id,
                reference_code=v.reference_code,
                total=_d(v.total),
                abonado=_d(abonado),
                saldo=saldo,
                due_date=v.due_date,
            )
        )
    return CarteraOut(
        cliente=ClienteOut.model_validate(cliente),
        saldo_total=sum((f.saldo for f in filas), Decimal("0.00")),
        ventas=filas,
    )


# ---- Notas crédito y débito --------------------------------------------------------------------


def _devueltas(db: Session, venta_id: int) -> dict[int, int]:
    filas = db.execute(
        select(MovimientoInventario.producto_id, func.sum(MovimientoInventario.cantidad))
        .where(MovimientoInventario.venta_id == venta_id, MovimientoInventario.tipo == "devolucion")
        .group_by(MovimientoInventario.producto_id)
    ).all()
    return {pid: int(cant) for pid, cant in filas}


def _guardar_nota(venta: Venta, factura: DocumentoElectronico, tipo: str, doc: DocumentoOut, monto: Decimal):
    fila = DocumentoElectronico(tipo=tipo, factura_origen_id=factura.id)
    _copiar_documento(fila, doc, monto)
    venta.documentos.append(fila)


def _exigir_validada(doc: DocumentoOut, que: str) -> None:
    if not doc.is_validated:
        raise HTTPException(
            status_code=502, detail=f"Factus no validó la {que} ({_resumen_errores(doc.errores)}); intenta de nuevo"
        )


async def crear_nota_credito(db: Session, venta_id: int, datos: NotaCreditoIn) -> Venta:
    """Emite la nota crédito.

    - 1 devolución parcial: repone el stock de los items y registra movimientos "devolucion".
    - 2 anulación: usa todo lo no devuelto, deja la venta "anulada" y repone el stock.
    - 5 pronto pago (solo fiado): descuenta `monto` del saldo, repartido entre las líneas de la factura.
    Los items llevan el precio e IVA de la factura original. Si la venta se cobró por QR el detalle
    trae `devolver_manual`. Factus se llama primero: si falla, no cambia nada en la venta.
    """
    venta = _cargar_venta(db, venta_id, bloquear=True)
    if venta.estado == "anulada":
        raise HTTPException(status_code=409, detail="La venta ya está anulada")
    factura = _factura_validada(venta)

    vendidas = {vi.producto_id: vi for vi in venta.items}
    devueltas = _devueltas(db, venta.id)
    restantes = {pid: vi.cantidad - devueltas.get(pid, 0) for pid, vi in vendidas.items()}

    devolver: list[tuple[VentaItem, int]] = []
    if datos.concepto == 1:
        if not datos.items:
            raise HTTPException(status_code=422, detail="Indica los productos a devolver")
        for pid, cantidad in _consolidar(datos.items).items():
            if pid not in vendidas:
                raise HTTPException(status_code=422, detail=f"El producto {pid} no hace parte de esta venta")
            if cantidad > restantes[pid]:
                raise HTTPException(
                    status_code=422,
                    detail=f"Solo se pueden devolver {restantes[pid]} unidad(es) de «{vendidas[pid].nombre}»",
                )
            devolver.append((vendidas[pid], cantidad))
    elif datos.concepto == 2:
        devolver = [(vi, restantes[vi.producto_id]) for vi in venta.items if restantes[vi.producto_id] > 0]
        if not devolver:
            raise HTTPException(status_code=409, detail="Todos los productos de esta venta ya fueron devueltos")

    if datos.concepto == 5:
        if venta.tipo_pago != "fiado":
            raise HTTPException(status_code=422, detail="El descuento por pronto pago solo aplica a ventas fiadas")
        if datos.monto is None:
            raise HTTPException(status_code=422, detail="Indica el monto del descuento por pronto pago")
        saldo = _saldo(venta)
        if datos.monto > saldo:
            raise HTTPException(
                status_code=422, detail=f"El descuento ({_cop(datos.monto)}) no puede superar el saldo ({_cop(saldo)})"
            )
        valor = Decimal(datos.monto)
        factor = valor / _dec(venta.total)
        items = []
        acumulado = Decimal(0)
        for i, vi in enumerate(venta.items):
            es_ultima = i == len(venta.items) - 1
            con_iva = valor - acumulado if es_ultima else _d(_valor_linea(vi.precio, vi.iva, vi.cantidad) * factor)
            acumulado += con_iva
            sin_iva = con_iva / (1 + Decimal(vi.iva) / 100)
            items.append(_item_factura(db, vi, 1, precio=sin_iva, nombre=f"Descuento por pronto pago - {vi.nombre}"))
    else:
        items = [_item_factura(db, vi, c) for vi, c in devolver]
        valor = _d(sum((_valor_linea(vi.precio, vi.iva, c) for vi, c in devolver), Decimal(0)))

    n = 1 + sum(1 for d in venta.documentos if d.tipo == "nota_credito")
    referencia = f"{settings.reference_prefix}-NC-{venta.id:04d}-{n}"
    try:
        doc = await facturacion.crear_nota_credito(
            referencia, factura.numero, datos.concepto, items, _pago_nota(venta, valor), _cliente_factura(venta.cliente)
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"No se pudo emitir la nota crédito en Factus: {_motivo(e)}")
    _exigir_validada(doc, "nota crédito")

    _guardar_nota(venta, factura, "nota_credito", doc, valor)
    if devolver:
        productos = _productos_bloqueados(db, [vi.producto_id for vi, _ in devolver])
        for vi, cantidad in devolver:
            _mover_stock(db, productos[vi.producto_id], cantidad, "devolucion", venta.id, f"Nota crédito {referencia}")
    if datos.concepto == 2:
        venta.estado = "anulada"
    else:
        db.flush()
        _reevaluar_fiado(venta)
    db.commit()
    return venta


async def crear_nota_debito(db: Session, venta_id: int, datos: NotaDebitoIn) -> Venta:
    """Emite la nota débito por los items agregados (al precio e IVA actuales del producto).

    Valida y descuenta su stock. Venta digital: crea un recaudo tipo diferencia ({REF}-ND{n}) por el
    valor con IVA. Fiado: sube el saldo. Si algo falla antes de terminar no se guarda nada local.
    """
    venta = _cargar_venta(db, venta_id, bloquear=True)
    if venta.estado == "anulada":
        raise HTTPException(status_code=409, detail="La venta está anulada")
    factura = _factura_validada(venta)

    pedido = _consolidar(datos.items)
    productos = _productos_bloqueados(db, list(pedido))
    items, valor = [], Decimal(0)
    for pid, cantidad in pedido.items():
        p = productos.get(pid)
        if p is None or not p.activo:
            raise HTTPException(status_code=404, detail=f"El producto {pid} no existe o está inactivo")
        if p.stock < cantidad:
            raise HTTPException(
                status_code=400, detail=f"Stock insuficiente de «{p.nombre}»: hay {p.stock} y se piden {cantidad}"
            )
        items.append(
            ItemFactura(codigo=p.codigo or f"P{p.id}", nombre=p.nombre, cantidad=Decimal(cantidad), precio=_d(p.precio), iva=p.iva)
        )
        valor += _valor_linea(p.precio, p.iva, cantidad)
    valor = _d(valor)
    if venta.tipo_pago == "digital":
        _exigir_monto_pay(_a_monto_pay(valor), "El valor de la nota débito")

    n = 1 + sum(1 for d in venta.documentos if d.tipo == "nota_debito")
    referencia = f"{settings.reference_prefix}-ND-{venta.id:04d}-{n}"
    try:
        doc = await facturacion.crear_nota_debito(
            referencia, factura.numero, datos.concepto, items, _pago_nota(venta, valor), _cliente_factura(venta.cliente)
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"No se pudo emitir la nota débito en Factus: {_motivo(e)}")
    _exigir_validada(doc, "nota débito")

    _guardar_nota(venta, factura, "nota_debito", doc, valor)
    for pid, cantidad in pedido.items():
        _mover_stock(db, productos[pid], -cantidad, "venta", venta.id, f"Nota débito {referencia}")
    if venta.tipo_pago == "digital":
        venta.recaudos.append(await _crear_recaudo(db, f"{venta.reference_code}-ND{n}", _a_monto_pay(valor), "diferencia"))
    else:
        db.flush()
        _reevaluar_fiado(venta)
    db.commit()
    return venta


# ---- Reportes ------------------------------------------------------------------------------------


def resumen(db: Session) -> ResumenOut:
    """Ventas de hoy (hora de Colombia), total de hoy, fiado pendiente y productos con stock <= stock_minimo.
    Cuentan las ventas pagadas o fiadas; no las que esperan pago ni las anuladas."""
    inicio = datetime.now(BOGOTA).replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
    cantidad, total = db.execute(
        select(func.count(Venta.id), func.coalesce(func.sum(Venta.total), 0)).where(
            Venta.created_at >= inicio, Venta.estado.in_(ESTADOS_CON_VENTA)
        )
    ).one()
    abiertas = db.scalars(select(Venta).where(Venta.tipo_pago == "fiado", Venta.estado == "fiado_abierto")).all()
    bajos = db.scalars(
        select(Producto).where(Producto.activo.is_(True), Producto.stock <= Producto.stock_minimo).order_by(Producto.nombre)
    ).all()
    return ResumenOut(
        ventas_hoy=int(cantidad),
        total_hoy=_d(total),
        fiado_pendiente=sum((_saldo(v) for v in abiertas), Decimal("0.00")),
        productos_bajo_stock=[ProductoOut.model_validate(p) for p in bajos],
    )
