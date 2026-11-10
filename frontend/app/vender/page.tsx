"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Banknote,
  QrCode,
  BookOpen,
  UserCheck,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  X,
  Receipt,
  ExternalLink,
  RotateCcw,
  Calendar,
  Mic,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { formatoCOP, formatoFechaCorta } from "@/lib/format";
import { useAlerta } from "@/components/AlertaContext";
import ModalCobroQR from "@/components/ModalCobroQR";
import ModalOrdenVoz from "@/components/ModalOrdenVoz";
import type {
  Cliente,
  ClienteCreate,
  Producto,
  TipoPago,
  VentaCreate,
  VentaDetalle,
} from "@/lib/types";

interface ItemCarrito {
  producto: Producto;
  cantidad: number;
}

export default function PaginaVender() {
  const { mostrarExito, mostrarError, mostrarInfo, ejecutarConCarga } = useAlerta();

  // Catálogo y búsqueda
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargandoProductos, setCargandoProductos] = useState(true);

  // Carrito
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);

  // Método de pago
  const [tipoPago, setTipoPago] = useState<TipoPago>("efectivo");

  // Efectivo: calculadora de cambio
  const [montoRecibido, setMontoRecibido] = useState<number | "">("");

  // Fiado: fecha límite de pago (YYYY-MM-DD)
  const hoyStr = new Date().toISOString().split("T")[0];
  const fechaPorDefecto15Dias = () => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return d.toISOString().split("T")[0];
  };
  const [dueDateFiado, setDueDateFiado] = useState<string>(fechaPorDefecto15Dias());

  // Clientes disponibles
  const [clientesDisponibles, setClientesDisponibles] = useState<Cliente[]>([]);

  // Factura a nombre del cliente
  const [facturarCliente, setFacturarCliente] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [clientesEncontrados, setClientesEncontrados] = useState<Cliente[]>([]);
  const [buscandoClientes, setBuscandoClientes] = useState(false);

  // Modal crear cliente
  const [modalClienteAbierto, setModalClienteAbierto] = useState(false);
  const [tipoDocNuevo, setTipoDocNuevo] = useState("13"); // 13: CC, 31: NIT
  const [docNuevo, setDocNuevo] = useState("");
  const [nombresNuevo, setNombresNuevo] = useState("");
  const [telefonoNuevo, setTelefonoNuevo] = useState("");
  const [emailNuevo, setEmailNuevo] = useState("");
  const [direccionNuevo, setDireccionNuevo] = useState("");

  // Modal de cobro QR (Flujo A)
  const [ventaEsperandoQR, setVentaEsperandoQR] = useState<VentaDetalle | null>(null);

  // Modal orden por voz (Paso 9)
  const [modalVozAbierto, setModalVozAbierto] = useState(false);

  // Estado de venta exitosa
  const [ventaCompletada, setVentaCompletada] = useState<VentaDetalle | null>(null);

  // Cargar productos y clientes iniciales
  useEffect(() => {
    const cargar = async () => {
      setCargandoProductos(true);
      try {
        const [resProds, resClis] = await Promise.all([
          api.listarProductos({ q: busqueda.trim() || undefined }),
          api.listarClientes(),
        ]);
        setProductos(resProds);
        setClientesDisponibles(resClis);
      } catch (err: unknown) {
        mostrarError(err instanceof Error ? err.message : "Error al cargar datos");
      } finally {
        setCargandoProductos(false);
      }
    };
    void cargar();
  }, [busqueda, mostrarError]);

  // Si cambia a Fiado, forzar cliente activo
  useEffect(() => {
    if (tipoPago === "fiado") {
      setFacturarCliente(true);
    }
  }, [tipoPago]);

  // Buscar clientes cuando escribe
  useEffect(() => {
    if (!facturarCliente || !busquedaCliente.trim()) {
      setClientesEncontrados([]);
      return;
    }

    const timer = setTimeout(async () => {
      setBuscandoClientes(true);
      try {
        const res = await api.listarClientes(busquedaCliente.trim());
        setClientesEncontrados(res);
      } catch {
        // Silencioso en búsqueda
      } finally {
        setBuscandoClientes(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [busquedaCliente, facturarCliente]);

  // Manejo de carrito
  const agregarAlCarrito = (prod: Producto) => {
    setCarrito((prev) => {
      const idx = prev.findIndex((item) => item.producto.id === prod.id);
      if (idx !== -1) {
        const nuevo = [...prev];
        nuevo[idx] = { ...nuevo[idx], cantidad: nuevo[idx].cantidad + 1 };
        return nuevo;
      }
      return [...prev, { producto: prod, cantidad: 1 }];
    });
  };

  const modificarCantidad = (prodId: number, delta: number) => {
    setCarrito((prev) => {
      return prev
        .map((item) => {
          if (item.producto.id === prodId) {
            const nuevaCantidad = item.cantidad + delta;
            return nuevaCantidad > 0 ? { ...item, cantidad: nuevaCantidad } : null;
          }
          return item;
        })
        .filter((item): item is ItemCarrito => item !== null);
    });
  };

  const eliminarDelCarrito = (prodId: number) => {
    setCarrito((prev) => prev.filter((item) => item.producto.id !== prodId));
  };

  const vaciarCarrito = () => {
    setCarrito([]);
    setMontoRecibido("");
    setClienteSeleccionado(null);
    setFacturarCliente(false);
    setTipoPago("efectivo");
  };

  // Cálculos de totales con IVA
  const subtotalSinIva = carrito.reduce(
    (acc, item) => acc + item.producto.precio * item.cantidad,
    0,
  );

  const totalIva19 = carrito.reduce((acc, item) => {
    if (item.producto.iva === 19) {
      return acc + Math.round(item.producto.precio * 0.19 * item.cantidad);
    }
    return acc;
  }, 0);

  const totalConIva = carrito.reduce((acc, item) => {
    const valorUnitarioConIva = Math.round(item.producto.precio * (1 + item.producto.iva / 100));
    return acc + valorUnitarioConIva * item.cantidad;
  }, 0);

  const devuelta =
    typeof montoRecibido === "number" && montoRecibido >= totalConIva
      ? montoRecibido - totalConIva
      : null;

  // Ajustar fecha rápida para el fiado (+X días)
  const ajustarFechaFiado = (dias: number) => {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    setDueDateFiado(d.toISOString().split("T")[0]);
  };

  // Guardar nuevo cliente
  const guardarNuevoCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docNuevo.trim() || !nombresNuevo.trim()) {
      mostrarError("Documento y nombres son obligatorios.");
      return;
    }

    const payload: ClienteCreate = {
      tipo_documento: tipoDocNuevo,
      documento: docNuevo.trim(),
      nombres: nombresNuevo.trim(),
      telefono: telefonoNuevo.trim() || undefined,
      email: emailNuevo.trim() || undefined,
      direccion: direccionNuevo.trim() || undefined,
    };

    const res = await ejecutarConCarga(async () => {
      return await api.crearCliente(payload);
    }, "Registrando cliente...");

    if (res) {
      mostrarExito(`Cliente "${res.nombres}" registrado.`);
      setClienteSeleccionado(res);
      setClientesDisponibles((prev) => [...prev, res]);
      setModalClienteAbierto(false);
      setDocNuevo("");
      setNombresNuevo("");
      setTelefonoNuevo("");
      setEmailNuevo("");
      setDireccionNuevo("");
    }
  };

  // Callback de confirmación por voz (Carga al carrito, nunca cobra directo)
  const handleConfirmarOrdenVoz = (datos: {
    items: { producto: Producto; cantidad: number }[];
    cliente: Cliente | null;
    tipoPago: TipoPago;
  }) => {
    setCarrito((prev) => {
      const nuevo = [...prev];
      datos.items.forEach(({ producto, cantidad }) => {
        const idx = nuevo.findIndex((c) => c.producto.id === producto.id);
        if (idx !== -1) {
          nuevo[idx] = { ...nuevo[idx], cantidad: nuevo[idx].cantidad + cantidad };
        } else {
          nuevo.push({ producto, cantidad });
        }
      });
      return nuevo;
    });

    if (datos.cliente) {
      setClienteSeleccionado(datos.cliente);
      setFacturarCliente(true);
    }

    setTipoPago(datos.tipoPago);
    mostrarInfo("Orden por voz cargada en el carrito. Revisa y presiona Cobrar cuando estés listo.");
  };

  // Procesar cobro según método seleccionado
  const procesarCobro = async () => {
    if (carrito.length === 0) {
      mostrarError("El carrito está vacío. Agrega productos para cobrar.");
      return;
    }

    // Validaciones para FIADO (Flujo B)
    if (tipoPago === "fiado") {
      if (!clienteSeleccionado) {
        mostrarError("El fiado exige un cliente con documento para emitir la factura a crédito.");
        return;
      }
      if (!dueDateFiado) {
        mostrarError("Debes seleccionar una fecha límite de pago para el fiado.");
        return;
      }
      if (dueDateFiado < hoyStr) {
        mostrarError("La fecha límite de pago no puede estar en el pasado.");
        return;
      }
    }

    if (facturarCliente && !clienteSeleccionado) {
      mostrarError("Activaste 'Factura a nombre del cliente'. Selecciona o registra un cliente.");
      return;
    }

    // Validación de límites Factus Pay en COP (Mínimo $10.000)
    if (tipoPago === "digital" && totalConIva < 10000) {
      mostrarError(
        `El monto mínimo para cobrar con QR Factus Pay es de ${formatoCOP(10000)}. Agrega más productos para alcanzar el límite.`,
      );
      return;
    }

    const payload: VentaCreate = {
      tipo_pago: tipoPago,
      items: carrito.map((c) => ({
        producto_id: c.producto.id,
        cantidad: c.cantidad,
      })),
      cliente_id: clienteSeleccionado ? clienteSeleccionado.id : undefined,
      facturar: facturarCliente || tipoPago === "digital" || tipoPago === "fiado",
      due_date: tipoPago === "fiado" ? dueDateFiado : undefined,
    };

    if (tipoPago === "efectivo") {
      const res = await ejecutarConCarga(async () => {
        return await api.crearVenta(payload);
      }, "Registrando venta en efectivo...");

      if (res) {
        setVentaCompletada(res);
        mostrarExito("¡Venta cobrada con éxito!");
      }
    } else if (tipoPago === "digital") {
      const res = await ejecutarConCarga(async () => {
        return await api.crearVenta(payload);
      }, "Generando cobro y QR en Factus Pay...");

      if (res) {
        setVentaEsperandoQR(res);
      }
    } else if (tipoPago === "fiado") {
      const res = await ejecutarConCarga(async () => {
        return await api.crearVenta(payload);
      }, "Registrando fiado y emitiendo factura a crédito...");

      if (res) {
        setVentaCompletada(res);
        mostrarExito("¡Fiado registrado y factura a crédito emitida!");
      }
    }
  };

  // Callback cuando se confirma el pago QR
  const handlePagoQRConfirmado = (ventaActualizada: VentaDetalle) => {
    setVentaEsperandoQR(null);
    setVentaCompletada(ventaActualizada);
    mostrarExito("¡Pago confirmado en Factus Pay y factura emitida!");
  };

  // Si la venta se completó, mostrar pantalla de éxito
  if (ventaCompletada) {
    const factura = ventaCompletada.documentos.find((d) => d.tipo === "factura");
    const esDigital = ventaCompletada.tipo_pago === "digital";
    const esFiado = ventaCompletada.tipo_pago === "fiado";

    return (
      <div className="mx-auto max-w-lg w-full flex flex-col items-center justify-center min-h-[75vh] py-6 text-center animate-in fade-in">
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 shadow-inner ${
            esFiado
              ? "bg-amber-100 text-amber-600"
              : "bg-emerald-100 text-emerald-600"
          }`}
        >
          {esFiado ? (
            <BookOpen className="w-9 h-9 stroke-[2.2]" />
          ) : (
            <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
          )}
        </div>

        <h1 className="text-2xl font-black text-slate-900">
          {esFiado
            ? "¡Venta a Fiado Registrada!"
            : esDigital
            ? "¡Pago recibido con Factus Pay!"
            : "¡Venta cobrada con éxito!"}
        </h1>
        <p className="text-sm font-mono text-slate-500 mt-1">
          Ref: {ventaCompletada.reference_code}
        </p>

        <div className="mt-6 w-full rounded-3xl bg-white p-5 shadow-sm border border-slate-200 text-left space-y-3.5">
          <div className="flex justify-between items-baseline border-b border-slate-100 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {esFiado ? "Total fiado" : "Total cobrado"}
            </span>
            <span
              className={`text-2xl font-black ${
                esFiado ? "text-amber-700" : "text-emerald-700"
              }`}
            >
              {formatoCOP(ventaCompletada.total)}
            </span>
          </div>

          <div className="flex justify-between text-xs text-slate-600">
            <span>Método de pago:</span>
            <span
              className={`font-bold uppercase px-2 py-0.5 rounded-md ${
                esFiado
                  ? "bg-amber-100 text-amber-900"
                  : esDigital
                  ? "bg-sky-100 text-sky-900"
                  : "bg-slate-100 text-slate-900"
              }`}
            >
              {esFiado ? "Fiado (A Crédito)" : esDigital ? "QR Bre-B (Factus Pay)" : "Efectivo"}
            </span>
          </div>

          {/* Datos específicos de FIADO: Saldo pendiente y Fecha límite */}
          {esFiado && (
            <div className="rounded-2xl bg-amber-50/80 p-3.5 border border-amber-200 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-amber-800 font-semibold">Saldo pendiente por cobrar:</span>
                <span className="font-black text-sm text-amber-950">
                  {formatoCOP(ventaCompletada.saldo)}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs pt-1 border-t border-amber-200/60">
                <span className="text-amber-800">Fecha límite de pago:</span>
                <span className="font-bold text-amber-900">
                  {formatoFechaCorta(ventaCompletada.due_date)}
                </span>
              </div>
            </div>
          )}

          {!esDigital && !esFiado && devuelta !== null && devuelta > 0 && (
            <div className="flex justify-between text-xs bg-amber-50 p-2.5 rounded-xl border border-amber-200">
              <span className="text-amber-800 font-medium">Cambio a entregar al cliente:</span>
              <strong className="text-sm font-black text-amber-900">
                {formatoCOP(devuelta)}
              </strong>
            </div>
          )}

          {ventaCompletada.cliente && (
            <div className="flex justify-between text-xs text-slate-600">
              <span>Cliente registrado:</span>
              <span className="font-bold text-slate-900">
                {ventaCompletada.cliente.nombres} ({ventaCompletada.cliente.documento})
              </span>
            </div>
          )}

          {/* Factura electrónica emitida (de contado o a crédito) */}
          {factura && (
            <div className="rounded-2xl bg-emerald-50/80 p-3.5 border border-emerald-200 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                <Receipt className="w-4 h-4" />
                <span>
                  {esFiado
                    ? "Factura Electrónica a Crédito (DIAN)"
                    : "Factura Electrónica Validada ante la DIAN"}
                </span>
              </div>
              <p className="text-xs text-emerald-800 font-mono">
                Número: <strong>{factura.numero ?? "SETP990033341"}</strong>
              </p>
              {factura.cufe && (
                <p className="text-[10px] text-emerald-700 break-all font-mono">
                  CUFE: {factura.cufe.substring(0, 24)}...
                </p>
              )}
              {factura.public_url && (
                <a
                  href={factura.public_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-700 underline hover:text-emerald-900"
                >
                  <span>Ver factura oficial en la DIAN</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          <div className="border-t border-slate-100 pt-3">
            <span className="text-xs font-semibold text-slate-500 block mb-2">
              Productos fiados/vendidos:
            </span>
            <ul className="divide-y divide-slate-100 text-xs">
              {ventaCompletada.items.map((it) => (
                <li key={it.id} className="py-1.5 flex justify-between">
                  <span className="text-slate-700">
                    {it.cantidad}x {it.nombre}
                  </span>
                  <span className="font-bold text-slate-900">
                    {formatoCOP(Math.round(it.precio * (1 + it.iva / 100) * it.cantidad))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-6 w-full space-y-2.5">
          <button
            type="button"
            onClick={() => {
              setVentaCompletada(null);
              vaciarCarrito();
            }}
            className="flex items-center justify-center gap-2 w-full rounded-2xl bg-emerald-600 py-4 text-base font-bold text-white shadow-lg shadow-emerald-600/20 active:scale-95 transition-all hover:bg-emerald-700 min-h-[52px]"
          >
            <RotateCcw className="w-5 h-5" />
            <span>Nueva venta</span>
          </button>

          {esFiado && (
            <Link
              href="/fiados"
              className="flex items-center justify-center gap-2 w-full rounded-2xl bg-amber-50 border border-amber-300 py-3.5 text-sm font-bold text-amber-900 hover:bg-amber-100 active:scale-95 transition-all min-h-[48px]"
            >
              <BookOpen className="w-4 h-4" />
              <span>Ver cartera de Fiados</span>
            </Link>
          )}

          <Link
            href={`/ventas/${ventaCompletada.id}`}
            className="flex items-center justify-center gap-2 w-full rounded-2xl border border-slate-300 bg-white py-3.5 text-sm font-bold text-slate-700 hover:bg-slate-50 active:scale-95 transition-all min-h-[48px]"
          >
            <span>Ver detalle completo de venta</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Punto de Venta</h1>
          <p className="text-xs text-slate-500">Registra ventas al contado, cobros QR Bre-B o fiados</p>
        </div>
        {carrito.length > 0 && (
          <button
            type="button"
            onClick={vaciarCarrito}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-800 font-semibold px-3 py-1.5 rounded-xl hover:bg-rose-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Vaciar carrito</span>
          </button>
        )}
      </div>

      {/* Cuadrícula de Escritorio: Catálogo a la izquierda, Ticket/Pago a la derecha */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUMNA IZQUIERDA: Catálogo de productos y Búsqueda */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          {/* Buscador de productos + Botón de Micrófono por Voz */}
          <div className="flex gap-2.5">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar producto por nombre o código..."
                className="w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-3 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 shadow-2xs"
              />
            </div>

            {/* Botón de orden por voz con micrófono */}
            <button
              type="button"
              onClick={() => setModalVozAbierto(true)}
              className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 active:scale-95 transition-all hover:bg-emerald-700 shrink-0 min-h-[46px]"
              title="Dictar orden con la voz"
            >
              <Mic className="w-4 h-4" />
              <span>Voz</span>
            </button>
          </div>

          {/* Catálogo rápido de productos para tocar y agregar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 px-1">
              <span>Catálogo ({productos.length} disponibles)</span>
              <span className="text-[11px] text-slate-400 hidden sm:inline">Haz clic para sumar al carrito</span>
            </div>

            {cargandoProductos ? (
              <div className="py-12 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200">
                Cargando catálogo...
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 max-h-[calc(100vh-250px)] lg:max-h-[720px] overflow-y-auto pr-1">
                {productos.map((prod) => {
                  const precioConIva = prod.precio * (1 + prod.iva / 100);
                  const enCarrito = carrito.find((c) => c.producto.id === prod.id);

                  return (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => agregarAlCarrito(prod)}
                      className={`flex flex-col justify-between text-left p-3.5 rounded-2xl border transition-all active:scale-98 min-h-[86px] ${
                        enCarrito
                          ? "bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-400 shadow-2xs"
                          : "bg-white border-slate-200/90 hover:border-emerald-300 hover:shadow-2xs"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1 w-full">
                        <span className="font-semibold text-slate-900 text-xs line-clamp-2 leading-snug">
                          {prod.nombre}
                        </span>
                        {enCarrito && (
                          <span className="shrink-0 rounded-full bg-emerald-600 px-1.5 py-0.2 text-[10px] font-black text-white">
                            {enCarrito.cantidad}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex items-baseline justify-between w-full pt-1 border-t border-slate-100">
                        <span className="text-xs font-bold text-emerald-800">
                          {formatoCOP(precioConIva)}
                        </span>
                        <span className={`text-[10px] font-medium ${prod.stock <= prod.stock_minimo ? "text-rose-600 font-bold" : "text-slate-400"}`}>
                          Stock: {prod.stock}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* COLUMNA DERECHA: Carrito, Facturación, Pago y Cobro */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4 lg:sticky lg:top-20">
          {/* CARRITO DE COMPRAS */}
          <div className="rounded-2xl bg-white p-4 shadow-sm border border-slate-200/90 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Pedido ({carrito.reduce((acc, c) => acc + c.cantidad, 0)} ítems)
              </span>
              {carrito.length > 0 && (
                <span className="text-xs font-black text-emerald-700">
                  {formatoCOP(totalConIva)}
                </span>
              )}
            </div>

            {carrito.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                El pedido está vacío. Toca productos a la izquierda o dicta con el botón de voz.
              </div>
            ) : (
              <div className="space-y-2 divide-y divide-slate-100 max-h-56 overflow-y-auto pr-1">
                {carrito.map((item) => {
                  const precioUnitarioConIva = Math.round(
                    item.producto.precio * (1 + item.producto.iva / 100),
                  );
                  const precioTotalFila = precioUnitarioConIva * item.cantidad;

                  return (
                    <div key={item.producto.id} className="pt-2 first:pt-0 flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {item.producto.nombre}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {formatoCOP(precioUnitarioConIva)} c/u
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => modificarCantidad(item.producto.id, -1)}
                          className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700 hover:bg-slate-200 active:scale-90"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-6 text-center font-black text-xs text-slate-900">
                          {item.cantidad}
                        </span>
                        <button
                          type="button"
                          onClick={() => modificarCantidad(item.producto.id, 1)}
                          className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center text-white hover:bg-slate-800 active:scale-90"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => eliminarDelCarrito(item.producto.id)}
                          className="p-1 text-slate-300 hover:text-rose-600 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="text-right shrink-0 w-16">
                        <span className="text-xs font-black text-slate-900">
                          {formatoCOP(precioTotalFila)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Resumen de totales */}
            {carrito.length > 0 && (
              <div className="mt-2 border-t border-slate-100 pt-2.5 space-y-1 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal sin IVA:</span>
                  <span>{formatoCOP(subtotalSinIva)}</span>
                </div>
                {totalIva19 > 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>IVA (19%):</span>
                    <span>{formatoCOP(totalIva19)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-black text-slate-900 pt-1.5 border-t border-slate-100">
                  <span>Total a pagar:</span>
                  <span className="text-emerald-700 text-lg">{formatoCOP(totalConIva)}</span>
                </div>
              </div>
            )}
          </div>

          {/* SELECTOR DE MÉTODO DE PAGO */}
          <div className="space-y-2">
            <span id="etiqueta-metodo-pago" className="block text-xs font-bold uppercase tracking-wider text-slate-600 px-1">
              Método de pago
            </span>
            <div role="group" aria-labelledby="etiqueta-metodo-pago" className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTipoPago("efectivo")}
                className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border transition-all active:scale-95 min-h-[64px] ${
                  tipoPago === "efectivo"
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-600/20"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <Banknote className="w-4 h-4 mb-1" />
                <span className="text-xs font-bold">Efectivo</span>
              </button>

              <button
                type="button"
                onClick={() => setTipoPago("digital")}
                className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border transition-all active:scale-95 min-h-[64px] ${
                  tipoPago === "digital"
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-600/20"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <QrCode className="w-4 h-4 mb-1" />
                <span className="text-xs font-bold">QR Bre-B</span>
              </button>

              <button
                type="button"
                onClick={() => setTipoPago("fiado")}
                className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border transition-all active:scale-95 min-h-[64px] ${
                  tipoPago === "fiado"
                    ? "bg-amber-600 text-white border-amber-600 shadow-sm shadow-amber-600/20"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <BookOpen className="w-4 h-4 mb-1" />
                <span className="text-xs font-bold">Fiado</span>
              </button>
            </div>
          </div>

          {/* CALCULADORA DE CAMBIO (Solo si es Efectivo) */}
          {tipoPago === "efectivo" && carrito.length > 0 && (
            <div className="rounded-2xl bg-slate-100 p-3 space-y-2 border border-slate-200">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>¿Con cuánto paga el cliente?:</span>
                {devuelta !== null && (
                  <span className="text-emerald-800 font-extrabold text-sm">
                    Devuelta: {formatoCOP(devuelta)}
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="number"
                  value={montoRecibido}
                  onChange={(e) =>
                    setMontoRecibido(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  placeholder="Ej. 20000"
                  className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {[10000, 20000, 50000].map((billete) => (
                  <button
                    key={billete}
                    type="button"
                    onClick={() => setMontoRecibido(billete)}
                    className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-700 active:scale-95 hover:bg-slate-50"
                  >
                    ${billete / 1000}k
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* AVISO DE LÍMITES PARA QR FACTUS PAY */}
          {tipoPago === "digital" && (
            <div className="rounded-2xl bg-sky-50 border border-sky-200 p-3 text-xs text-sky-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <QrCode className="w-4 h-4 text-sky-700" />
                <span>Cobro instantáneo con Factus Pay</span>
              </div>
              <p className="text-[11px] text-sky-800">
                Genera un código QR y una llave Bre-B compatible con cualquier entidad financiera.
              </p>
              {totalConIva > 0 && totalConIva < 10000 && (
                <p className="text-[11px] font-bold text-rose-600 mt-1">
                  ⚠️ Monto mínimo en Factus Pay: {formatoCOP(10000)}. Te faltan {formatoCOP(10000 - totalConIva)}.
                </p>
              )}
            </div>
          )}

          {/* CAMPOS ESPECÍFICOS DE FIADO: FECHA LÍMITE (due_date) */}
          {tipoPago === "fiado" && (
            <div className="rounded-2xl bg-amber-50/80 border border-amber-300 p-3.5 space-y-2.5">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-700" />
                <div>
                  <span className="text-xs font-bold text-amber-950 block leading-tight">
                    Fecha límite de pago (due_date) *
                  </span>
                  <span className="text-[10px] text-amber-800">
                    Requerido por la DIAN para emitir la factura a crédito
                  </span>
                </div>
              </div>

              <div>
                <input
                  type="date"
                  required
                  min={hoyStr}
                  value={dueDateFiado}
                  onChange={(e) => setDueDateFiado(e.target.value)}
                  className="w-full rounded-xl border border-amber-300 bg-white p-2.5 text-xs font-bold text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
                />

                {/* Accesos rápidos de fechas para el tendero */}
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => ajustarFechaFiado(8)}
                    className="flex-1 py-1 rounded-lg border border-amber-200 bg-white text-[11px] font-bold text-amber-900 hover:bg-amber-100/60 active:scale-95"
                  >
                    +8 días
                  </button>
                  <button
                    type="button"
                    onClick={() => ajustarFechaFiado(15)}
                    className="flex-1 py-1 rounded-lg border border-amber-200 bg-white text-[11px] font-bold text-amber-900 hover:bg-amber-100/60 active:scale-95"
                  >
                    +15 días
                  </button>
                  <button
                    type="button"
                    onClick={() => ajustarFechaFiado(30)}
                    className="flex-1 py-1 rounded-lg border border-amber-200 bg-white text-[11px] font-bold text-amber-900 hover:bg-amber-100/60 active:scale-95"
                  >
                    +30 días
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* SECCIÓN CLIENTE */}
          <div className="rounded-2xl bg-white p-3.5 border border-slate-200/90 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <div>
                  <span className="text-xs font-bold text-slate-900 block leading-tight">
                    {tipoPago === "fiado" ? "Cliente del Fiado *" : "Factura a nombre de cliente"}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {tipoPago === "fiado"
                      ? "Obligatorio para la cartera"
                      : facturarCliente
                      ? "Se emitirá con datos DIAN"
                      : "Consumidor Final"}
                  </span>
                </div>
              </div>

              {tipoPago !== "fiado" && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={facturarCliente}
                  onClick={() => {
                    const nuevo = !facturarCliente;
                    setFacturarCliente(nuevo);
                    if (!nuevo) setClienteSeleccionado(null);
                  }}
                  className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                    facturarCliente ? "bg-emerald-600" : "bg-slate-300"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow-xs transform transition-transform ${
                      facturarCliente ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              )}
            </div>

            {/* Búsqueda y selección de cliente */}
            {(facturarCliente || tipoPago === "fiado") && (
              <div className="pt-2 border-t border-slate-100 space-y-2 animate-in fade-in">
                {clienteSeleccionado ? (
                  <div className="flex items-center justify-between rounded-xl bg-emerald-50 p-2.5 border border-emerald-200">
                    <div>
                      <p className="text-xs font-bold text-emerald-900">
                        {clienteSeleccionado.nombres}
                      </p>
                      <p className="text-[11px] text-emerald-700 font-mono">
                        {clienteSeleccionado.tipo_documento === "31" ? "NIT" : "CC"}:{" "}
                        {clienteSeleccionado.documento}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setClienteSeleccionado(null)}
                      className="text-xs font-bold text-rose-600 hover:text-rose-800 p-1"
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                        <input
                          type="search"
                          value={busquedaCliente}
                          onChange={(e) => setBusquedaCliente(e.target.value)}
                          placeholder="Cédula o nombre..."
                          className="w-full rounded-xl border border-slate-300 bg-white pl-8 pr-2.5 py-1.5 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setModalClienteAbierto(true)}
                        className="flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white shrink-0 hover:bg-slate-800 active:scale-95"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>+ Crear</span>
                      </button>
                    </div>

                    {buscandoClientes && (
                      <p className="text-[10px] text-slate-400 text-center">Buscando clientes...</p>
                    )}

                    {clientesEncontrados.length > 0 && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 max-h-32 overflow-y-auto divide-y divide-slate-200">
                        {clientesEncontrados.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setClienteSeleccionado(c);
                              setBusquedaCliente("");
                              setClientesEncontrados([]);
                            }}
                            className="w-full text-left p-2 text-xs hover:bg-white flex justify-between items-center transition-colors"
                          >
                            <span className="font-semibold text-slate-800 truncate">{c.nombres}</span>
                            <span className="font-mono text-[10px] text-slate-500 shrink-0">{c.documento}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* BOTÓN COBRAR / REGISTRAR */}
          <div className="pt-1">
            {tipoPago === "efectivo" && (
              <button
                type="button"
                disabled={carrito.length === 0}
                onClick={procesarCobro}
                className={`flex items-center justify-center gap-2 w-full rounded-2xl py-3.5 text-sm font-bold text-white shadow-sm transition-all active:scale-98 min-h-[50px] ${
                  carrito.length === 0
                    ? "bg-slate-300 cursor-not-allowed shadow-none"
                    : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20"
                }`}
              >
                <Banknote className="w-5 h-5" />
                <span>
                  {carrito.length === 0
                    ? "Agrega productos para cobrar"
                    : `Cobrar ${formatoCOP(totalConIva)} en Efectivo`}
                </span>
              </button>
            )}

            {tipoPago === "digital" && (
              <button
                type="button"
                disabled={carrito.length === 0 || totalConIva < 10000}
                onClick={procesarCobro}
                className={`flex items-center justify-center gap-2 w-full rounded-2xl py-3.5 text-sm font-bold text-white shadow-sm transition-all active:scale-98 min-h-[50px] ${
                  carrito.length === 0 || totalConIva < 10000
                    ? "bg-slate-300 cursor-not-allowed shadow-none"
                    : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20"
                }`}
              >
                <QrCode className="w-5 h-5" />
                <span>
                  {carrito.length === 0
                    ? "Agrega productos para cobrar"
                    : totalConIva < 10000
                    ? `Mínimo ${formatoCOP(10000)} para QR`
                    : `Cobrar ${formatoCOP(totalConIva)} con QR Bre-B`}
                </span>
              </button>
            )}

            {tipoPago === "fiado" && (
              <button
                type="button"
                disabled={carrito.length === 0 || !clienteSeleccionado}
                onClick={procesarCobro}
                className={`flex items-center justify-center gap-2 w-full rounded-2xl py-3.5 text-sm font-bold text-white shadow-sm transition-all active:scale-98 min-h-[50px] ${
                  carrito.length === 0 || !clienteSeleccionado
                    ? "bg-slate-300 cursor-not-allowed shadow-none"
                    : "bg-amber-600 hover:bg-amber-700 shadow-amber-600/20"
                }`}
              >
                <BookOpen className="w-5 h-5" />
                <span>
                  {carrito.length === 0
                    ? "Agrega productos para fiar"
                    : !clienteSeleccionado
                    ? "Selecciona un cliente para fiar"
                    : `Registrar Fiado (${formatoCOP(totalConIva)})`}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* MODAL COBRO CON QR (Flujo A) */}
      {ventaEsperandoQR && (
        <ModalCobroQR
          venta={ventaEsperandoQR}
          onPagoConfirmado={handlePagoQRConfirmado}
          onCerrar={() => setVentaEsperandoQR(null)}
        />
      )}

      {/* MODAL ORDEN POR VOZ (Paso 9) */}
      {modalVozAbierto && (
        <ModalOrdenVoz
          productos={productos}
          clientes={clientesDisponibles}
          onConfirmarOrden={handleConfirmarOrdenVoz}
          onCerrar={() => setModalVozAbierto(false)}
        />
      )}

      {/* MODAL CREAR CLIENTE */}
      {modalClienteAbierto && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h2 className="text-lg font-black text-slate-900">Registrar nuevo cliente</h2>
              <button
                type="button"
                onClick={() => setModalClienteAbierto(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={guardarNuevoCliente} className="space-y-3.5">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label htmlFor="cliente-tipo-doc" className="block text-xs font-bold text-slate-700 mb-1">Tipo Doc *</label>
                  <select id="cliente-tipo-doc"
                    value={tipoDocNuevo}
                    onChange={(e) => setTipoDocNuevo(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="13">CC (Cédula)</option>
                    <option value="31">NIT (Empresa)</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label htmlFor="cliente-documento" className="block text-xs font-bold text-slate-700 mb-1">
                    Número de documento *
                  </label>
                  <input id="cliente-documento"
                    type="text"
                    required
                    value={docNuevo}
                    onChange={(e) => setDocNuevo(e.target.value)}
                    placeholder="Ej. 1020304050"
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="cliente-nombres" className="block text-xs font-bold text-slate-700 mb-1">
                  Nombres o Razón Social *
                </label>
                <input id="cliente-nombres"
                  type="text"
                  required
                  value={nombresNuevo}
                  onChange={(e) => setNombresNuevo(e.target.value)}
                  placeholder="Ej. Lucía Gómez"
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="cliente-telefono" className="block text-xs font-bold text-slate-700 mb-1">Teléfono</label>
                  <input id="cliente-telefono"
                    type="tel"
                    value={telefonoNuevo}
                    onChange={(e) => setTelefonoNuevo(e.target.value)}
                    placeholder="3001234567"
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label htmlFor="cliente-email" className="block text-xs font-bold text-slate-700 mb-1">Email</label>
                  <input id="cliente-email"
                    type="email"
                    value={emailNuevo}
                    onChange={(e) => setEmailNuevo(e.target.value)}
                    placeholder="correo@ejemplo.com"
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="cliente-direccion" className="block text-xs font-bold text-slate-700 mb-1">Dirección</label>
                <input id="cliente-direccion"
                  type="text"
                  value={direccionNuevo}
                  onChange={(e) => setDireccionNuevo(e.target.value)}
                  placeholder="Calle 10 # 5-20"
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full rounded-2xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-md active:scale-95 hover:bg-emerald-700"
                >
                  Guardar y seleccionar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
