"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Receipt,
  Search,
  Filter,
  ChevronRight,
  Clock,
  CheckCircle2,
  BookOpen,
  XCircle,
  Banknote,
  QrCode,
  Calendar,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatoCOP, formatoFecha } from "@/lib/format";
import { useAlerta } from "@/components/AlertaContext";
import type { EstadoVenta, VentaResumen } from "@/lib/types";

const FILTROS_ESTADO: { valor: string; etiqueta: string }[] = [
  { valor: "", etiqueta: "Todas" },
  { valor: "pagada", etiqueta: "Pagadas" },
  { valor: "esperando_pago", etiqueta: "Esperando pago" },
  { valor: "fiado_abierto", etiqueta: "Fiado pendiente" },
  { valor: "fiado_pagado", etiqueta: "Fiado pagado" },
  { valor: "anulada", etiqueta: "Anuladas" },
];

export default function PaginaVentas() {
  const { mostrarError } = useAlerta();

  const [ventas, setVentas] = useState<VentaResumen[]>([]);
  const [filtroEstado, setFiltroEstado] = useState<string>("");
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);

  const cargarVentas = async () => {
    setCargando(true);
    try {
      const res = await api.listarVentas({
        estado: filtroEstado || undefined,
      });
      setVentas(res);
    } catch (err: unknown) {
      mostrarError(err instanceof Error ? err.message : "Error al cargar ventas");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargarVentas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado]);

  // Filtrado local por búsqueda de texto
  const ventasFiltradas = ventas.filter((v) => {
    if (!busqueda.trim()) return true;
    const q = busqueda.toLowerCase();
    return v.reference_code.toLowerCase().includes(q) || v.tipo_pago.toLowerCase().includes(q);
  });

  const badgeEstado = (estado: EstadoVenta) => {
    switch (estado) {
      case "pagada":
        return {
          clase: "bg-emerald-100 text-emerald-800 border-emerald-200",
          texto: "Pagada",
          Icono: CheckCircle2,
        };
      case "esperando_pago":
        return {
          clase: "bg-sky-100 text-sky-800 border-sky-200",
          texto: "Esperando QR",
          Icono: Clock,
        };
      case "fiado_abierto":
        return {
          clase: "bg-amber-100 text-amber-900 border-amber-300 font-extrabold",
          texto: "Fiado pendiente",
          Icono: BookOpen,
        };
      case "fiado_pagado":
        return {
          clase: "bg-emerald-50 text-emerald-700 border-emerald-200",
          texto: "Fiado pagado",
          Icono: CheckCircle2,
        };
      case "anulada":
        return {
          clase: "bg-rose-100 text-rose-800 border-rose-200 line-through",
          texto: "Anulada",
          Icono: XCircle,
        };
      default:
        return {
          clase: "bg-slate-100 text-slate-800 border-slate-200",
          texto: estado,
          Icono: Receipt,
        };
    }
  };

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Historial de Ventas</h1>
          <p className="text-xs text-slate-500">Consulta comprobantes, facturas electrónicas y notas DIAN</p>
        </div>
        <Link
          href="/vender"
          className="self-start sm:self-auto rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-95 transition-all"
        >
          + Nueva Venta
        </Link>
      </div>

      {/* Buscador y Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por código de referencia..."
            className="w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 shadow-2xs"
          />
        </div>

        {/* Filtros horizontales */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {FILTROS_ESTADO.map((f) => {
            const activo = filtroEstado === f.valor;
            return (
              <button
                key={f.valor}
                type="button"
                onClick={() => setFiltroEstado(f.valor)}
                className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition-all border ${
                  activo
                    ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {f.etiqueta}
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista de ventas en cuadrícula responsive */}
      {cargando ? (
        <div className="py-16 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200">
          Cargando ventas...
        </div>
      ) : ventasFiltradas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center space-y-2">
          <Receipt className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="font-bold text-slate-800 text-sm">No se encontraron ventas</p>
          <p className="text-xs text-slate-400">
            {filtroEstado
              ? "Prueba cambiando el filtro de estado."
              : "Registra tu primera venta en el módulo Vender."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {ventasFiltradas.map((venta) => {
            const b = badgeEstado(venta.estado);
            const IconoEstado = b.Icono;

            return (
              <Link
                key={venta.id}
                href={`/ventas/${venta.id}`}
                className="block rounded-2xl bg-white p-4 shadow-sm border border-slate-200/90 hover:border-emerald-300 active:scale-99 transition-all space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs font-black text-slate-900">
                      {venta.reference_code}
                    </span>
                    <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <Calendar className="w-3 h-3" />
                      <span>{formatoFecha(venta.created_at)}</span>
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="text-base font-black text-slate-900 block">
                      {formatoCOP(venta.total)}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold border ${b.clase}`}
                    >
                      <IconoEstado className="w-3 h-3" />
                      <span>{b.texto}</span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100 text-slate-500">
                  <span className="capitalize flex items-center gap-1">
                    {venta.tipo_pago === "efectivo" && <Banknote className="w-3.5 h-3.5" />}
                    {venta.tipo_pago === "digital" && <QrCode className="w-3.5 h-3.5" />}
                    {venta.tipo_pago === "fiado" && <BookOpen className="w-3.5 h-3.5" />}
                    <span>{venta.tipo_pago === "digital" ? "QR Bre-B" : venta.tipo_pago}</span>
                  </span>

                  <span className="inline-flex items-center text-xs font-bold text-emerald-700">
                    <span>Ver detalle</span>
                    <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
