"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  TrendingUp,
  Receipt,
  BookOpen,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  ShoppingBag,
  Package,
  CheckCircle2,
  Calendar,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatoCOP } from "@/lib/format";
import { useAlerta } from "@/components/AlertaContext";
import type { Producto, ResumenReporte } from "@/lib/types";

export default function PaginaResumen() {
  const { mostrarError } = useAlerta();

  const [resumen, setResumen] = useState<ResumenReporte | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargarResumen = async () => {
    setCargando(true);
    try {
      const data = await api.resumen();
      setResumen(data);
    } catch (err: unknown) {
      mostrarError(err instanceof Error ? err.message : "Error al cargar resumen");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarResumen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fechaHoy = new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Resumen del Día</h1>
          <p className="text-xs text-slate-500 capitalize">{fechaHoy}</p>
        </div>
        <button
          type="button"
          onClick={cargarResumen}
          disabled={cargando}
          className="self-start sm:self-auto flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-50 active:scale-95 transition-all shadow-2xs"
          title="Actualizar datos"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${cargando ? "animate-spin text-emerald-600" : ""}`} />
          <span>Actualizar</span>
        </button>
      </div>

      {cargando && !resumen ? (
        <div className="py-20 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200">
          Cargando indicadores de la tienda...
        </div>
      ) : resumen ? (
        <div className="space-y-6">
          {/* CUADRÍCULA DE 4 TARJETAS PRINCIPALES */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Total vendido hoy */}
            <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-800 p-5 text-white shadow-sm shadow-emerald-700/20">
              <div className="flex items-center justify-between text-emerald-100 text-xs font-bold uppercase tracking-wider">
                <span>Vendido hoy</span>
                <TrendingUp className="w-5 h-5 text-emerald-300" />
              </div>
              <div className="mt-2 text-3xl font-black tracking-tight">
                {formatoCOP(resumen.total_hoy)}
              </div>
              <p className="mt-1 text-[11px] text-emerald-100/90 font-medium">
                Contado, QR e ingresos registrados
              </p>
            </div>

            {/* 2. Ventas de hoy */}
            <Link
              href="/ventas"
              className="rounded-2xl bg-white p-5 border border-slate-200/90 shadow-2xs flex flex-col justify-between hover:border-emerald-300 active:scale-98 transition-all min-h-[110px]"
            >
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Operaciones
                </span>
                <div className="p-1.5 rounded-xl bg-slate-100 text-slate-700">
                  <Receipt className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-black text-slate-900">
                  {resumen.ventas_hoy}
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  Ventas emitidas hoy
                </span>
              </div>
            </Link>

            {/* 3. Fiado pendiente */}
            <Link
              href="/fiados"
              className="rounded-2xl bg-white p-5 border border-slate-200/90 shadow-2xs flex flex-col justify-between hover:border-amber-300 active:scale-98 transition-all min-h-[110px]"
            >
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                  Por cobrar
                </span>
                <div className="p-1.5 rounded-xl bg-amber-50 text-amber-700">
                  <BookOpen className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-xl font-black text-amber-800">
                  {formatoCOP(resumen.fiado_pendiente)}
                </span>
                <span className="text-[11px] text-amber-700 font-medium block mt-0.5">
                  Cartera pendiente
                </span>
              </div>
            </Link>

            {/* 4. Stock crítico */}
            <Link
              href="/inventario"
              className="rounded-2xl bg-white p-5 border border-slate-200/90 shadow-2xs flex flex-col justify-between hover:border-rose-300 active:scale-98 transition-all min-h-[110px]"
            >
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700">
                  Stock bajo
                </span>
                <div className="p-1.5 rounded-xl bg-rose-50 text-rose-700">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <span className="text-2xl font-black text-rose-800">
                  {resumen.productos_bajo_stock.length}
                </span>
                <span className="text-[11px] text-rose-600 font-medium block mt-0.5">
                  Productos por reabastecer
                </span>
              </div>
            </Link>
          </div>

          {/* CUADRÍCULA INFERIOR: STOCK BAJO Y ACCESOS */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* PRODUCTOS CON STOCK BAJO */}
            <div className="lg:col-span-8 rounded-2xl bg-white p-5 shadow-2xs border border-slate-200/90 space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-rose-50 text-rose-700">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 leading-tight">
                      Alertas de mercancía
                    </h2>
                    <span className="text-[11px] text-slate-400">
                      {resumen.productos_bajo_stock.length} producto(s) en nivel mínimo o agotados
                    </span>
                  </div>
                </div>

                <Link
                  href="/inventario"
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-0.5"
                >
                  <span>Ver inventario</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {resumen.productos_bajo_stock.length === 0 ? (
                <div className="rounded-xl bg-emerald-50/60 p-6 border border-emerald-100 text-center space-y-1">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                  <p className="text-xs font-bold text-emerald-900">
                    ¡Excelente! Tu inventario está abastecido
                  </p>
                  <p className="text-[11px] text-emerald-700">
                    No tienes productos por debajo del stock mínimo de alerta.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {resumen.productos_bajo_stock.map((prod) => (
                    <div
                      key={prod.id}
                      className="py-3 flex items-center justify-between text-xs gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{prod.nombre}</p>
                        <p className="text-[11px] text-slate-400">
                          {formatoCOP(prod.precio * (1 + prod.iva / 100))}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="inline-block px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200">
                          Stock: {prod.stock} / Mín: {prod.stock_minimo}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ACCIONES RÁPIDAS DEL TENDERO */}
            <div className="lg:col-span-4 rounded-2xl bg-white p-5 shadow-2xs border border-slate-200/90 space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Accesos rápidos
              </h2>

              <div className="space-y-2">
                <Link
                  href="/vender"
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40 transition-all text-xs font-semibold text-slate-800"
                >
                  <div className="flex items-center gap-2.5">
                    <ShoppingBag className="w-4 h-4 text-emerald-600" />
                    <span>Iniciar nueva venta</span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                </Link>

                <Link
                  href="/inventario"
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40 transition-all text-xs font-semibold text-slate-800"
                >
                  <div className="flex items-center gap-2.5">
                    <Package className="w-4 h-4 text-emerald-600" />
                    <span>Registrar entrada de mercancía</span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                </Link>

                <Link
                  href="/fiados"
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-amber-300 hover:bg-amber-50/40 transition-all text-xs font-semibold text-slate-800"
                >
                  <div className="flex items-center gap-2.5">
                    <BookOpen className="w-4 h-4 text-amber-600" />
                    <span>Cobrar abonos de fiados</span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                </Link>
              </div>
            </div>
          </div>

          {/* ACCESOS RÁPIDOS PARA EL TENDERO */}
          <div className="space-y-2 pt-1">
            <span className="text-xs font-black uppercase tracking-wider text-slate-600 px-1 block">
              Acciones rápidas
            </span>

            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/vender"
                className="flex items-center gap-2 p-3.5 rounded-2xl bg-slate-900 text-white hover:bg-slate-800 active:scale-95 transition-all"
              >
                <ShoppingBag className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold">Hacer venta</span>
              </Link>

              <Link
                href="/inventario"
                className="flex items-center gap-2 p-3.5 rounded-2xl bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 active:scale-95 transition-all"
              >
                <Package className="w-4 h-4 text-slate-600" />
                <span className="text-xs font-bold">Surtir stock</span>
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
