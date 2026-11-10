"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Search,
  MessageCircle,
  QrCode,
  Calendar,
  AlertTriangle,
  ChevronRight,
  User,
  CheckCircle2,
  X,
  CreditCard,
  Phone,
  ArrowLeft,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { formatoCOP, formatoFechaCorta } from "@/lib/format";
import { useAlerta } from "@/components/AlertaContext";
import ModalCobroQR from "@/components/ModalCobroQR";
import type { Cartera, CarteraVenta, Cliente, VentaDetalle } from "@/lib/types";

export default function PaginaFiados() {
  const { mostrarExito, mostrarError, mostrarInfo, ejecutarConCarga } = useAlerta();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carterasPorCliente, setCarterasPorCliente] = useState<Record<number, Cartera>>({});
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);

  // Cliente seleccionado para ver detalle de cartera
  const [clienteActivo, setClienteActivo] = useState<Cliente | null>(null);
  const [carteraActiva, setCarteraActiva] = useState<Cartera | null>(null);

  // Modal para ingresar monto del abono
  const [modalAbonoAbierto, setModalAbonoAbierto] = useState(false);
  const [ventaAbono, setVentaAbono] = useState<CarteraVenta | null>(null);
  const [montoAbono, setMontoAbono] = useState<number>(10000);

  // Modal QR de abono
  const [ventaConQR, setVentaConQR] = useState<VentaDetalle | null>(null);

  // Cargar carteras de los clientes
  const cargarDatos = async () => {
    setCargando(true);
    try {
      const listaClientes = await api.listarClientes();
      setClientes(listaClientes);

      // Cargar cartera para cada cliente
      const mapaCarteras: Record<number, Cartera> = {};
      for (const c of listaClientes) {
        try {
          const cart = await api.cartera(c.id);
          if (cart.saldo_total > 0) {
            mapaCarteras[c.id] = cart;
          }
        } catch {
          // Si el cliente no tiene cartera abierta, continúa
        }
      }
      setCarterasPorCliente(mapaCarteras);

      // Si había un cliente seleccionado, refrescar su cartera
      if (clienteActivo && mapaCarteras[clienteActivo.id]) {
        setCarteraActiva(mapaCarteras[clienteActivo.id]);
      }
    } catch (err: unknown) {
      mostrarError(err instanceof Error ? err.message : "Error al cargar fiados");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargarDatos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clientes con saldo pendiente (> 0)
  const clientesConDeuda = clientes.filter((c) => {
    const cart = carterasPorCliente[c.id];
    const tieneSaldo = cart && cart.saldo_total > 0;
    if (!tieneSaldo) return false;

    if (!busqueda.trim()) return true;
    const q = busqueda.toLowerCase();
    return (
      c.nombres.toLowerCase().includes(q) ||
      c.documento.includes(q) ||
      (c.telefono && c.telefono.includes(q))
    );
  });

  const totalCarteraTienda = Object.values(carterasPorCliente).reduce(
    (acc, cart) => acc + cart.saldo_total,
    0,
  );

  // Abrir detalle de un cliente
  const verDetalleCliente = async (cliente: Cliente) => {
    setClienteActivo(cliente);
    const cart = carterasPorCliente[cliente.id];
    if (cart) {
      setCarteraActiva(cart);
    } else {
      const res = await ejecutarConCarga(async () => {
        return await api.cartera(cliente.id);
      }, "Cargando cartera...");
      if (res) setCarteraActiva(res);
    }
  };

  // Abrir WhatsApp con saldo prellenado
  const enviarRecordatorioWhatsApp = (cliente: Cliente, saldo: number) => {
    if (!cliente.telefono) {
      mostrarInfo(
        `El cliente ${cliente.nombres} no tiene un teléfono registrado. Edítalo en Clientes para agregar su número.`,
      );
      return;
    }

    // Limpiar teléfono
    const soloDigitos = cliente.telefono.replace(/\D/g, "");
    const numeroFinal = soloDigitos.startsWith("57") ? soloDigitos : `57${soloDigitos}`;

    const mensaje = `Hola ${cliente.nombres}, te saludamos de la tienda StoreGo. Te recordamos cordialmente que tienes un saldo pendiente de ${formatoCOP(
      saldo,
    )}. ¡Muchas gracias por tu apoyo y preferencia!`;

    const url = `https://wa.me/${numeroFinal}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, "_blank");
  };

  // Abrir modal de abono para una venta
  const abrirModalAbono = (venta: CarteraVenta) => {
    setVentaAbono(venta);
    // Mínimo de Factus Pay es 10000, o el saldo total si es menor
    const montoSugerido = Math.min(Math.max(10000, 10000), venta.saldo);
    setMontoAbono(montoSugerido);
    setModalAbonoAbierto(true);
  };

  // Generar abono vía QR Factus Pay
  const generarAbonoQR = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ventaAbono) return;

    if (montoAbono < 10000) {
      mostrarError(
        `El monto mínimo para recaudos con Factus Pay es de ${formatoCOP(10000)}.`,
      );
      return;
    }

    if (montoAbono > ventaAbono.saldo) {
      mostrarError(
        `El abono no puede superar el saldo pendiente (${formatoCOP(ventaAbono.saldo)}).`,
      );
      return;
    }

    const res = await ejecutarConCarga(async () => {
      return await api.crearAbono(ventaAbono.venta_id, { monto: montoAbono });
    }, "Generando cobro QR para el abono...");

    if (res) {
      setModalAbonoAbierto(false);
      setVentaConQR(res);
    }
  };

  // Cuando se confirma el pago del abono en el modal QR
  const handleAbonoConfirmado = (ventaActualizada: VentaDetalle) => {
    setVentaConQR(null);
    mostrarExito("¡Abono pagado y acreditado a la cartera con éxito!");
    void cargarDatos();
  };

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Cartera de Fiados</h1>
          <p className="text-xs text-slate-500">Control de deudas, recordatorios por WhatsApp y cobro de abonos con QR</p>
        </div>
        <Link
          href="/vender"
          className="self-start sm:self-auto inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-95 transition-all"
        >
          <span>+ Nuevo Fiado</span>
        </Link>
      </div>

      {/* Cuadrícula de Escritorio: Lista de Clientes a la Izquierda, Cartera a la Derecha */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUMNA IZQUIERDA: Tarjeta total, Buscador y Lista de Clientes */}
        <div className={`space-y-4 ${clienteActivo ? "hidden lg:block lg:col-span-5" : "lg:col-span-5"}`}>
          {/* Tarjeta resumen del total fiado */}
          <div className="rounded-2xl bg-gradient-to-br from-amber-600 to-amber-800 p-5 text-white shadow-sm shadow-amber-600/20">
            <div className="flex items-center justify-between opacity-90 text-xs font-bold uppercase tracking-wider">
              <span>Por cobrar en la calle</span>
              <BookOpen className="w-5 h-5 text-amber-200" />
            </div>
            <div className="mt-2 text-3xl font-black tracking-tight">
              {formatoCOP(totalCarteraTienda)}
            </div>
            <p className="mt-1 text-[11px] text-amber-100 font-medium">
              {clientesConDeuda.length} cliente(s) con saldo pendiente
            </p>
          </div>

          {/* Buscador */}
          <div className="relative">
            <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar cliente por nombre o cédula..."
              className="w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 shadow-2xs"
            />
          </div>

          {/* Lista de clientes */}
          {cargando ? (
            <div className="py-12 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200">
              Cargando cartera de clientes...
            </div>
          ) : clientesConDeuda.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center space-y-2">
              <CheckCircle2 className="w-9 h-9 text-emerald-500 mx-auto" />
              <p className="font-bold text-slate-800 text-sm">¡Al día con las cuentas!</p>
              <p className="text-xs text-slate-400">
                {busqueda
                  ? "No se encontraron clientes para esa búsqueda."
                  : "No tienes clientes con saldos pendientes."}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
              {clientesConDeuda.map((cliente) => {
                const cart = carterasPorCliente[cliente.id];
                const saldo = cart ? cart.saldo_total : 0;
                const cantVentas = cart ? cart.ventas.length : 0;
                const seleccionado = clienteActivo?.id === cliente.id;

                return (
                  <div
                    key={cliente.id}
                    className={`rounded-2xl p-4 transition-all border space-y-3 ${
                      seleccionado
                        ? "bg-amber-50/70 border-amber-300 ring-1 ring-amber-400 shadow-2xs"
                        : "bg-white border-slate-200/90 hover:border-amber-300 hover:shadow-2xs"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center font-bold text-amber-800 text-sm">
                          {cliente.nombres.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 text-sm leading-snug">
                            {cliente.nombres}
                          </h3>
                          <p className="text-[11px] text-slate-400 font-mono">
                            {cliente.tipo_documento === "31" ? "NIT" : "CC"}: {cliente.documento}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Debe
                        </span>
                        <span className="text-base font-black text-amber-800">
                          {formatoCOP(saldo)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                      <span>{cantVentas} cuenta(s) pendiente(s)</span>
                      {cliente.telefono && <span>Tel: {cliente.telefono}</span>}
                    </div>

                    {/* Botones de acción rápida */}
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => verDetalleCliente(cliente)}
                        className={`flex-1 flex items-center justify-center gap-1 rounded-xl py-2 px-3 text-xs font-bold transition-all min-h-[38px] ${
                          seleccionado
                            ? "bg-amber-600 text-white"
                            : "bg-slate-900 text-white hover:bg-slate-800 active:scale-95"
                        }`}
                      >
                        <span>Ver cuentas / Abonar</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => enviarRecordatorioWhatsApp(cliente, saldo)}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 active:scale-95 transition-all min-h-[38px]"
                        title="Enviar recordatorio por WhatsApp"
                      >
                        <MessageCircle className="w-3.5 h-3.5 fill-emerald-600 text-emerald-600" />
                        <span>WhatsApp</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* COLUMNA DERECHA: Detalle de Cartera del Cliente Seleccionado */}
        <div className={`space-y-4 lg:col-span-7 lg:sticky lg:top-20 ${!clienteActivo ? "hidden lg:block" : ""}`}>
          {clienteActivo && carteraActiva ? (
            <div className="space-y-4 animate-in fade-in">
              <button
                type="button"
                onClick={() => {
                  setClienteActivo(null);
                  setCarteraActiva(null);
                }}
                className="lg:hidden inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 p-1"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Volver a todos los clientes</span>
              </button>

              <div className="rounded-2xl bg-white p-5 shadow-2xs border border-slate-200/90 space-y-3.5">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">{clienteActivo.nombres}</h2>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      {clienteActivo.tipo_documento === "31" ? "NIT" : "CC"}: {clienteActivo.documento}
                    </p>
                    {clienteActivo.telefono && (
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{clienteActivo.telefono}</span>
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Deuda total
                    </span>
                    <span className="text-2xl font-black text-amber-800">
                      {formatoCOP(carteraActiva.saldo_total)}
                    </span>
                  </div>
                </div>

                {/* Botón Recordar por WhatsApp */}
                <button
                  type="button"
                  onClick={() =>
                    enviarRecordatorioWhatsApp(clienteActivo, carteraActiva.saldo_total)
                  }
                  className="flex items-center justify-center gap-2 w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 active:scale-98 transition-all"
                >
                  <MessageCircle className="w-4 h-4 fill-white text-emerald-600" />
                  <span>Recordar saldo por WhatsApp</span>
                </button>
              </div>

              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 px-1 pt-1">
                Ventas fiadas pendientes ({carteraActiva.ventas.length})
              </h3>

              <div className="space-y-3 max-h-[calc(100vh-340px)] overflow-y-auto pr-1">
                {carteraActiva.ventas.map((v) => {
                  const hoy = new Date().toISOString().split("T")[0];
                  const vencida = v.due_date && v.due_date < hoy;

                  return (
                    <div
                      key={v.venta_id}
                      className="rounded-2xl bg-white p-4 shadow-2xs border border-slate-200/90 space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="font-mono text-xs font-bold text-slate-900">
                            {v.reference_code}
                          </span>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>Vence: {formatoFechaCorta(v.due_date)}</span>
                            {vencida && (
                              <span className="rounded-md bg-rose-100 px-1.5 py-0.2 text-[10px] font-bold text-rose-800">
                                ¡Vencido!
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-xs text-slate-400 block">Saldo</span>
                          <span className="text-base font-bold text-amber-800">
                            {formatoCOP(v.saldo)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                        <span>Total venta: {formatoCOP(v.total)}</span>
                        <span>Abonado: {formatoCOP(v.abonado)}</span>
                      </div>

                      {/* Botón Abonar */}
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => abrirModalAbono(v)}
                          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 py-2.5 px-3 text-xs font-bold text-white hover:bg-slate-800 active:scale-95 transition-all min-h-[40px]"
                        >
                          <QrCode className="w-4 h-4 text-emerald-400" />
                          <span>Abonar con QR Bre-B</span>
                        </button>

                        <Link
                          href={`/ventas/${v.venta_id}`}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center"
                        >
                          Ver detalle
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center space-y-3">
              <BookOpen className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-base font-bold text-slate-800">Selecciona un cliente</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Elige un cliente de la lista de la izquierda para ver el desglose de sus ventas a fiado, recordarle el saldo por WhatsApp o registrar abonos con QR Bre-B.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL PARA INGRESAR MONTO DEL ABONO */}
      {modalAbonoAbierto && ventaAbono && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h2 className="text-lg font-black text-slate-900">Abonar a la cuenta</h2>
                <p className="text-xs text-slate-500 font-mono">
                  {ventaAbono.reference_code}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalAbonoAbierto(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={generarAbonoQR} className="space-y-4">
              <div className="rounded-2xl bg-amber-50 p-3.5 border border-amber-200 flex justify-between items-center text-xs">
                <span className="text-amber-800 font-medium">Saldo pendiente actual:</span>
                <strong className="text-base font-black text-amber-950">
                  {formatoCOP(ventaAbono.saldo)}
                </strong>
              </div>

              <div>
                <label htmlFor="fiado-monto-abono" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Monto a abonar (COP) *
                </label>
                <input id="fiado-monto-abono"
                  type="number"
                  required
                  min="10000"
                  max={ventaAbono.saldo}
                  step="500"
                  value={montoAbono}
                  onChange={(e) => setMontoAbono(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 p-3 text-xl font-black text-slate-900 focus:border-emerald-600 focus:outline-none text-center"
                />
                <span className="text-[10px] text-slate-400 block mt-1 text-center">
                  Mínimo Factus Pay: $10.000 COP • Máximo: saldo total
                </span>

                {/* Atajos de montos */}
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setMontoAbono(10000)}
                    className="flex-1 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 hover:bg-slate-100"
                  >
                    $10.000
                  </button>
                  <button
                    type="button"
                    onClick={() => setMontoAbono(20000)}
                    className="flex-1 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 hover:bg-slate-100"
                  >
                    $20.000
                  </button>
                  <button
                    type="button"
                    onClick={() => setMontoAbono(ventaAbono.saldo)}
                    className="flex-1 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
                  >
                    Todo el saldo
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full rounded-2xl bg-emerald-600 py-3.5 text-base font-bold text-white shadow-md active:scale-95 transition-all hover:bg-emerald-700 min-h-[50px]"
                >
                  Generar QR de Abono
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL QR DE FACTUS PAY PARA EL ABONO */}
      {ventaConQR && (
        <ModalCobroQR
          venta={ventaConQR}
          onPagoConfirmado={handleAbonoConfirmado}
          onCerrar={() => setVentaConQR(null)}
        />
      )}
    </div>
  );
}
