"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Receipt,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  PlusCircle,
  XCircle,
  ExternalLink,
  Calendar,
  Clock,
  User,
  Banknote,
  BookOpen,
  AlertCircle,
  DollarSign,
  X,
  FileText,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { formatoCOP, formatoFecha } from "@/lib/format";
import { useAlerta } from "@/components/AlertaContext";
import ModalCobroQR from "@/components/ModalCobroQR";
import type {
  DocumentoElectronico,
  ItemIn,
  Producto,
  Recaudo,
  VentaDetalle,
  VentaItem,
} from "@/lib/types";

interface PaginaDetalleVentaProps {
  params: Promise<{ id: string }>;
}

export default function PaginaDetalleVenta({ params }: PaginaDetalleVentaProps) {
  const resolvedParams = use(params);
  const ventaId = parseInt(resolvedParams.id, 10);
  const router = useRouter();

  const { mostrarExito, mostrarError, mostrarInfo, ejecutarConCarga } = useAlerta();

  const [venta, setVenta] = useState<VentaDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [productosCatalogo, setProductosCatalogo] = useState<Producto[]>([]);

  // Modales de acciones
  const [modalDevolucionAbierto, setModalDevolucionAbierto] = useState(false);
  const [cantidadesDevolver, setCantidadesDevolver] = useState<Record<number, number>>({});

  const [modalAgregarAbierto, setModalAgregarAbierto] = useState(false);
  const [productoAgregarId, setProductoAgregarId] = useState<number | "">("");
  const [cantidadAgregar, setCantidadAgregar] = useState<number>(1);

  // Modal QR para cobro de diferencia si se genera en Nota Débito
  const [ventaCobroDiferencia, setVentaCobroDiferencia] = useState<VentaDetalle | null>(null);

  const cargarVenta = async () => {
    setCargando(true);
    try {
      const [v, prods] = await Promise.all([api.venta(ventaId), api.listarProductos()]);
      setVenta(v);
      setProductosCatalogo(prods);
    } catch (err: unknown) {
      mostrarError(err instanceof Error ? err.message : "Error al cargar detalle de venta");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargarVenta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventaId]);

  // 1. Devolver productos (Nota Crédito Concepto 1)
  const abrirModalDevolucion = () => {
    if (!venta) return;
    const inicial: Record<number, number> = {};
    venta.items.forEach((it) => {
      inicial[it.producto_id] = 0;
    });
    setCantidadesDevolver(inicial);
    setModalDevolucionAbierto(true);
  };

  const ejecutarDevolucion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!venta) return;

    const itemsADevolver: ItemIn[] = Object.entries(cantidadesDevolver)
      .filter(([_, cant]) => cant > 0)
      .map(([prodId, cant]) => ({
        producto_id: parseInt(prodId, 10),
        cantidad: cant,
      }));

    if (itemsADevolver.length === 0) {
      mostrarError("Debes seleccionar al menos una unidad de algún producto para devolver.");
      return;
    }

    const res = await ejecutarConCarga(async () => {
      return await api.notaCredito(venta.id, {
        concepto: 1,
        items: itemsADevolver,
        observacion: "Devolución parcial de mercancía",
      });
    }, "Emitiendo Nota Crédito ante la DIAN...");

    if (res) {
      mostrarExito("Nota Crédito (Devolución) emitida con éxito.");
      setModalDevolucionAbierto(false);
      void cargarVenta();
    }
  };

  // 2. Anular venta (Nota Crédito Concepto 2)
  const ejecutarAnulacion = async () => {
    if (!venta) return;
    const confirmacion = window.confirm(
      "¿Estás seguro de anular esta venta por completo?\n\nSe emitirá una Nota Crédito de anulación total ante la DIAN y se repondrá el inventario.",
    );
    if (!confirmacion) return;

    const res = await ejecutarConCarga(async () => {
      return await api.notaCredito(venta.id, {
        concepto: 2,
        observacion: "Anulación total de la venta",
      });
    }, "Anulando venta y emitiendo Nota Crédito...");

    if (res) {
      mostrarExito("Venta anulada y Nota Crédito emitida.");
      void cargarVenta();
    }
  };

  // 3. Agregar productos (Nota Débito Concepto 3)
  const ejecutarAgregarProductos = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!venta) return;

    if (!productoAgregarId || cantidadAgregar <= 0) {
      mostrarError("Selecciona un producto y una cantidad válida mayor a 0.");
      return;
    }

    const res = await ejecutarConCarga(async () => {
      return await api.notaDebito(venta.id, {
        concepto: 3,
        items: [{ producto_id: Number(productoAgregarId), cantidad: cantidadAgregar }],
        observacion: "Adición de productos",
      });
    }, "Emitiendo Nota Débito ante la DIAN...");

    if (res) {
      mostrarExito("Nota Débito emitida con éxito.");
      setModalAgregarAbierto(false);
      // Si fue digital, puede haber generado un recaudo de diferencia
      const recaudoDiferencia = res.recaudos.find(
        (r) => r.tipo === "diferencia" && r.estado === "ready",
      );
      if (recaudoDiferencia) {
        setVentaCobroDiferencia(res);
      }
      void cargarVenta();
    }
  };

  if (cargando) {
    return (
      <div className="py-20 text-center text-xs text-slate-400">
        Cargando comprobante de venta...
      </div>
    );
  }

  if (!venta) {
    return (
      <div className="py-12 text-center space-y-3">
        <p className="text-sm font-bold text-slate-700">No se encontró la venta especificada.</p>
        <Link
          href="/ventas"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al listado de ventas</span>
        </Link>
      </div>
    );
  }

  const factura = venta.documentos.find((d) => d.tipo === "factura");
  const notasCredito = venta.documentos.filter((d) => d.tipo === "nota_credito");
  const notasDebito = venta.documentos.filter((d) => d.tipo === "nota_debito");
  const tieneFacturaValidada = factura && factura.is_validated;
  const esAnulada = venta.estado === "anulada";

  return (
    <div className="space-y-5">
      {/* Encabezado con botón volver */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => router.back()}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="Volver"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Venta {venta.reference_code}
            </h1>
            <p className="text-xs text-slate-500">Detalle de la operación y comprobantes electrónicos</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUMNA IZQUIERDA: Resumen e Ítems */}
        <div className="lg:col-span-7 space-y-4">

      {/* AVISO IMPORTANTE: Devolver Dinero Manual */}
      {typeof venta.devolver_manual === "number" && venta.devolver_manual > 0 && (
        <div
          role="alert"
          className="rounded-3xl bg-rose-50 border-2 border-rose-300 p-4 shadow-sm space-y-1.5 animate-in fade-in"
        >
          <div className="flex items-center gap-2 text-rose-900 font-black text-sm">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>Devolución de Dinero Manual Requerida</span>
          </div>
          <p className="text-xs text-rose-800 leading-relaxed">
            Debes entregar <strong className="font-black text-rose-950 text-sm">{formatoCOP(venta.devolver_manual)}</strong> en
            efectivo al cliente en el mostrador.
          </p>
          <p className="text-[11px] text-rose-600 font-medium">
            Factus Pay no realiza reversos bancarios automáticos sobre pagos digitales ya acreditados.
          </p>
        </div>
      )}

      {/* Factura pendiente de emisión */}
      {venta.factura_pendiente && (
        <div className="rounded-2xl bg-amber-50 border border-amber-300 p-3.5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
            <AlertCircle className="w-4 h-4 text-amber-700" />
            <span>Factura electrónica pendiente ante la DIAN</span>
          </div>
          {venta.factura_error && (
            <p className="text-[11px] text-amber-800">{venta.factura_error}</p>
          )}
          <button
            type="button"
            onClick={async () => {
              await api.refrescarPago(venta.id);
              void cargarVenta();
            }}
            className="rounded-xl bg-amber-600 text-white px-3 py-1.5 text-xs font-bold"
          >
            Reintentar envío a la DIAN
          </button>
        </div>
      )}

      {/* Tarjeta Resumen Principal */}
      <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200/90 space-y-3.5">
        <div className="flex justify-between items-baseline border-b border-slate-100 pb-3">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
              Total Venta
            </span>
            <span
              className={`text-2xl font-black ${
                esAnulada ? "line-through text-slate-400" : "text-slate-900"
              }`}
            >
              {formatoCOP(venta.total)}
            </span>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Estado
            </span>
            <span
              className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase ${
                venta.estado === "pagada"
                  ? "bg-emerald-100 text-emerald-800"
                  : venta.estado === "fiado_abierto"
                  ? "bg-amber-100 text-amber-900"
                  : venta.estado === "fiado_pagado"
                  ? "bg-emerald-50 text-emerald-700"
                  : venta.estado === "anulada"
                  ? "bg-rose-100 text-rose-800"
                  : "bg-sky-100 text-sky-800"
              }`}
            >
              {venta.estado}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="text-slate-600">
            <span className="block text-slate-400 text-[10px] font-bold uppercase">Método</span>
            <span className="font-bold capitalize">{venta.tipo_pago}</span>
          </div>
          <div className="text-slate-600">
            <span className="block text-slate-400 text-[10px] font-bold uppercase">Fecha</span>
            <span>{formatoFecha(venta.created_at)}</span>
          </div>
          {venta.saldo > 0 && (
            <div className="text-amber-800 font-bold col-span-2 pt-1">
              <span>Saldo pendiente: {formatoCOP(venta.saldo)}</span>
              {venta.due_date && <span> (Límite: {venta.due_date})</span>}
            </div>
          )}
        </div>

        {venta.cliente && (
          <div className="rounded-2xl bg-slate-50 p-3 border border-slate-100 text-xs">
            <span className="text-[10px] font-bold uppercase text-slate-400 block">
              Cliente asociado
            </span>
            <p className="font-bold text-slate-800">{venta.cliente.nombres}</p>
            <p className="text-slate-500 font-mono text-[11px]">
              {venta.cliente.tipo_documento === "31" ? "NIT" : "CC"}: {venta.cliente.documento}
            </p>
          </div>
        )}
      </div>

      {/* ÍTEMS VENDIDOS */}
      <div className="rounded-3xl bg-white p-4 shadow-sm border border-slate-200/90 space-y-2">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 px-1">
          Productos de la venta ({venta.items.length})
        </h3>
        <div className="divide-y divide-slate-100 text-xs">
          {venta.items.map((it) => {
            const precioTotalConIva = Math.round(it.precio * (1 + it.iva / 100) * it.cantidad);
            return (
              <div key={it.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-900">{it.nombre}</p>
                  <p className="text-slate-400 text-[11px]">
                    {it.cantidad} un. x {formatoCOP(it.precio)} (IVA {it.iva}%)
                  </p>
                </div>
                <span className="font-black text-slate-900 text-sm">
                  {formatoCOP(precioTotalConIva)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>

    {/* COLUMNA DERECHA: Documentos, Recaudos y Acciones */}
    <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-20">
      {/* DOCUMENTOS DIAN (Facturas, Notas Crédito, Notas Débito) */}
      <div className="rounded-3xl bg-white p-4 shadow-sm border border-slate-200/90 space-y-3">
        <div className="flex items-center gap-2 px-1">
          <FileText className="w-4 h-4 text-emerald-600" />
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">
            Documentos Electrónicos DIAN ({venta.documentos.length})
          </h3>
        </div>

        {venta.documentos.length === 0 ? (
          <p className="text-xs text-slate-400 py-3 text-center">
            No se han emitido documentos electrónicos para esta venta.
          </p>
        ) : (
          <div className="space-y-2.5">
            {venta.documentos.map((doc) => (
              <div
                key={doc.id}
                className="rounded-2xl bg-slate-50 border border-slate-200 p-3.5 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`font-black uppercase px-2 py-0.5 rounded-md text-[10px] ${
                      doc.tipo === "factura"
                        ? "bg-emerald-100 text-emerald-900"
                        : doc.tipo === "nota_credito"
                        ? "bg-rose-100 text-rose-900"
                        : "bg-sky-100 text-sky-900"
                    }`}
                  >
                    {doc.tipo.replace("_", " ")}
                  </span>
                  <span className="font-mono font-bold text-slate-900">
                    {doc.numero ?? doc.reference_code}
                  </span>
                </div>

                {doc.cufe && (
                  <p className="text-[10px] text-slate-500 font-mono break-all leading-tight">
                    CUFE/CUDE: {doc.cufe}
                  </p>
                )}

                {doc.public_url && (
                  <a
                    href={doc.public_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 underline hover:text-emerald-900 pt-1"
                  >
                    <span>Ver documento oficial en la DIAN</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* RECAUDOS FACTUS PAY (Si aplica) */}
      {venta.recaudos.length > 0 && (
        <div className="rounded-3xl bg-white p-4 shadow-sm border border-slate-200/90 space-y-3">
          <div className="flex items-center gap-2 px-1">
            <QrCode className="w-4 h-4 text-sky-600" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">
              Recaudos Factus Pay ({venta.recaudos.length})
            </h3>
          </div>

          <div className="space-y-2">
            {venta.recaudos.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl border border-slate-200 p-3 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-mono font-bold text-slate-800 text-xs">
                    {r.reference_code}
                  </span>
                  <p className="text-slate-400 text-[11px] capitalize">
                    Tipo: {r.tipo} {r.breb_key && `• ${r.breb_key}`}
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-black text-slate-900 block">
                    {formatoCOP(r.monto)}
                  </span>
                  <span
                    className={`text-[10px] font-extrabold uppercase px-1.5 py-0.2 rounded-md ${
                      r.estado === "paid"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {r.estado}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ACCIONES DIAN: DEVOLVER / ANULAR / AGREGAR */}
      {!esAnulada && (
        <div className="rounded-3xl bg-white p-4 shadow-sm border border-slate-200/90 space-y-2.5">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 px-1">
            Gestión de Comprobantes DIAN
          </h3>

          {!tieneFacturaValidada && (
            <p className="text-[11px] text-slate-400 px-1">
              Las notas crédito y débito exigen una factura electrónica validada.
            </p>
          )}

          <div className="grid grid-cols-1 gap-2 pt-1">
            {/* 1. Devolver productos */}
            <button
              type="button"
              disabled={!tieneFacturaValidada}
              onClick={abrirModalDevolucion}
              className={`flex items-center justify-center gap-2 rounded-2xl py-3 text-xs font-bold transition-all min-h-[46px] border ${
                tieneFacturaValidada
                  ? "bg-slate-900 text-white border-slate-900 hover:bg-slate-800 active:scale-98"
                  : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
              }`}
            >
              <RotateCcw className="w-4 h-4 text-amber-400" />
              <span>Devolver productos (Nota Crédito parcial)</span>
            </button>

            {/* 2. Agregar productos */}
            <button
              type="button"
              disabled={!tieneFacturaValidada}
              onClick={() => setModalAgregarAbierto(true)}
              className={`flex items-center justify-center gap-2 rounded-2xl py-3 text-xs font-bold transition-all min-h-[46px] border ${
                tieneFacturaValidada
                  ? "bg-white text-slate-800 border-slate-300 hover:bg-slate-50 active:scale-98"
                  : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
              }`}
            >
              <PlusCircle className="w-4 h-4 text-emerald-600" />
              <span>Agregar productos (Nota Débito)</span>
            </button>

            {/* 3. Anular venta */}
            <button
              type="button"
              disabled={!tieneFacturaValidada}
              onClick={ejecutarAnulacion}
              className={`flex items-center justify-center gap-2 rounded-2xl py-3 text-xs font-bold transition-all min-h-[46px] border ${
                tieneFacturaValidada
                  ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 active:scale-98"
                  : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
              }`}
            >
              <XCircle className="w-4 h-4 text-rose-600" />
              <span>Anular venta completa (Nota Crédito total)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  </div>

      {/* MODAL: DEVOLVER PRODUCTOS (NC Concepto 1) */}
      {modalDevolucionAbierto && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h2 className="text-base font-black text-slate-900">Devolución de productos</h2>
                <p className="text-xs text-slate-500 font-mono">
                  Nota Crédito Concepto 1
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalDevolucionAbierto(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={ejecutarDevolucion} className="space-y-4">
              <p className="text-xs text-slate-600">
                Selecciona la cantidad de unidades que el cliente devuelve al inventario:
              </p>

              <div className="space-y-3 divide-y divide-slate-100">
                {venta.items.map((it) => (
                  <div key={it.id} className="pt-2.5 first:pt-0 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-900 block">{it.nombre}</span>
                      <span className="text-slate-400 text-[11px]">
                        Compradas: {it.cantidad} un. ({formatoCOP(it.precio)})
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500">Devolver:</span>
                      <select
                        value={cantidadesDevolver[it.producto_id] || 0}
                        onChange={(e) =>
                          setCantidadesDevolver((prev) => ({
                            ...prev,
                            [it.producto_id]: Number(e.target.value),
                          }))
                        }
                        className="rounded-xl border border-slate-300 p-2 text-xs font-bold bg-white"
                      >
                        {Array.from({ length: it.cantidad + 1 }, (_, i) => i).map((num) => (
                          <option key={num} value={num}>
                            {num}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full rounded-2xl bg-slate-900 py-3.5 text-xs font-bold text-white shadow-md hover:bg-slate-800 active:scale-95 transition-all min-h-[48px]"
                >
                  Emitir Nota Crédito de Devolución
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: AGREGAR PRODUCTOS (ND Concepto 3) */}
      {modalAgregarAbierto && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h2 className="text-base font-black text-slate-900">Agregar productos</h2>
                <p className="text-xs text-slate-500 font-mono">
                  Nota Débito Concepto 3
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalAgregarAbierto(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={ejecutarAgregarProductos} className="space-y-4">
              <div>
                <label htmlFor="venta-producto-agregar" className="block text-xs font-bold text-slate-700 mb-1">
                  Producto a añadir *
                </label>
                <select id="venta-producto-agregar"
                  required
                  value={productoAgregarId}
                  onChange={(e) => setProductoAgregarId(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 p-3 text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Selecciona un producto del catálogo...</option>
                  {productosCatalogo.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} — {formatoCOP(p.precio * (1 + p.iva / 100))} (Stock: {p.stock})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="venta-cantidad-agregar" className="block text-xs font-bold text-slate-700 mb-1">
                  Cantidad a añadir *
                </label>
                <input id="venta-cantidad-agregar"
                  type="number"
                  required
                  min="1"
                  value={cantidadAgregar}
                  onChange={(e) => setCantidadAgregar(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 p-3 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full rounded-2xl bg-slate-900 py-3.5 text-xs font-bold text-white shadow-md hover:bg-slate-800 active:scale-95 transition-all min-h-[48px]"
                >
                  Emitir Nota Débito ante DIAN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal QR si se generó recaudo de diferencia por Nota Débito en venta digital */}
      {ventaCobroDiferencia && (
        <ModalCobroQR
          venta={ventaCobroDiferencia}
          onPagoConfirmado={() => {
            setVentaCobroDiferencia(null);
            mostrarExito("¡Cobro de diferencia en Factus Pay completado!");
            void cargarVenta();
          }}
          onCerrar={() => setVentaCobroDiferencia(null)}
        />
      )}
    </div>
  );
}
