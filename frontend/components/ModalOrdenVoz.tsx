"use client";

import { useState, useEffect, useRef } from "react";
import {
  Mic,
  MicOff,
  Sparkles,
  X,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Banknote,
  QrCode,
  BookOpen,
  User,
  ShoppingBag,
  HelpCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatoCOP } from "@/lib/format";
import { useAlerta } from "@/components/AlertaContext";
import type { Cliente, Producto, TipoPago, VozItem, VozResultado } from "@/lib/types";

// Declaración para TypeScript de la Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
}

interface IWindow extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

interface ModalOrdenVozProps {
  productos: Producto[];
  clientes: Cliente[];
  onConfirmarOrden: (datos: {
    items: { producto: Producto; cantidad: number }[];
    cliente: Cliente | null;
    tipoPago: TipoPago;
  }) => void;
  onCerrar: () => void;
}

export default function ModalOrdenVoz({
  productos,
  clientes,
  onConfirmarOrden,
  onCerrar,
}: ModalOrdenVozProps) {
  const { mostrarError, mostrarExito, mostrarInfo, ejecutarConCarga } = useAlerta();

  const [soportaVoz, setSoportaVoz] = useState<boolean>(true);
  const [escuchando, setEscuchando] = useState<boolean>(false);
  const [textoVoz, setTextoVoz] = useState<string>("");
  const recognitionRef = useRef<any>(null);

  // Paso 2: Confirmación interactiva de la orden interpretada
  const [ordenInterpretada, setOrdenInterpretada] = useState<VozResultado | null>(null);
  const [itemsConfirmacion, setItemsConfirmacion] = useState<
    { producto: Producto; cantidad: number }[]
  >([]);
  const [clienteConfirmacion, setClienteConfirmacion] = useState<Cliente | null>(null);
  const [tipoPagoConfirmacion, setTipoPagoConfirmacion] = useState<TipoPago>("efectivo");

  // Detección de soporte de Web Speech API
  useEffect(() => {
    if (typeof window !== "undefined") {
      const win = window as unknown as IWindow;
      const SpeechRecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;
      if (SpeechRecognitionClass) {
        setSoportaVoz(true);
        const recognition = new SpeechRecognitionClass();
        recognition.lang = "es-CO"; // Español Colombia
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          const transcripcion = event.results[0][0].transcript;
          setTextoVoz(transcripcion);
          setEscuchando(false);
        };

        recognition.onerror = () => {
          setEscuchando(false);
          mostrarInfo("No se detectó audio claro. Puedes escribir la orden manualmente.");
        };

        recognition.onend = () => {
          setEscuchando(false);
        };

        recognitionRef.current = recognition;
      } else {
        setSoportaVoz(false);
      }
    }
  }, [mostrarInfo]);

  // Iniciar / detener reconocimiento de voz
  const toggleEscucha = () => {
    if (!recognitionRef.current) return;

    if (escuchando) {
      recognitionRef.current.stop();
      setEscuchando(false);
    } else {
      try {
        setTextoVoz("");
        recognitionRef.current.start();
        setEscuchando(true);
      } catch {
        setEscuchando(false);
      }
    }
  };

  // Interpretar la frase con el backend
  const procesarInterpretacion = async () => {
    if (!textoVoz.trim()) {
      mostrarError("Ingresa o dicta una orden antes de interpretar.");
      return;
    }

    const res = await ejecutarConCarga(async () => {
      return await api.interpretarVoz(textoVoz.trim());
    }, "Interpretando orden por voz...");

    if (res) {
      setOrdenInterpretada(res);

      // Mapear items detectados a productos reales del catálogo
      const itemsMapeados: { producto: Producto; cantidad: number }[] = [];
      res.items.forEach((it) => {
        const prod = productos.find((p) => p.id === it.producto_id);
        if (prod) {
          itemsMapeados.push({ producto: prod, cantidad: it.cantidad || 1 });
        }
      });
      setItemsConfirmacion(itemsMapeados);

      // Mapear cliente si se reconoció
      if (res.cliente) {
        const cli = clientes.find((c) => c.id === res.cliente?.id);
        setClienteConfirmacion(cli || null);
      } else {
        setClienteConfirmacion(null);
      }

      // Mapear tipo de pago si se reconoció
      if (res.tipo_pago) {
        setTipoPagoConfirmacion(res.tipo_pago);
      } else {
        setTipoPagoConfirmacion("efectivo");
      }
    }
  };

  // Modificar cantidades en el modal de confirmación
  const cambiarCantidad = (index: number, delta: number) => {
    setItemsConfirmacion((prev) => {
      const nuevo = [...prev];
      const nuevaCantidad = nuevo[index].cantidad + delta;
      if (nuevaCantidad <= 0) {
        return nuevo.filter((_, i) => i !== index);
      }
      nuevo[index] = { ...nuevo[index], cantidad: nuevaCantidad };
      return nuevo;
    });
  };

  const eliminarItem = (index: number) => {
    setItemsConfirmacion((prev) => prev.filter((_, i) => i !== index));
  };

  // Confirmar y cargar al carrito (NUNCA cobra directamente sin pasar por el carrito)
  const finalizarCargaCarrito = () => {
    if (itemsConfirmacion.length === 0) {
      mostrarError("Debes tener al menos un producto en la orden.");
      return;
    }

    onConfirmarOrden({
      items: itemsConfirmacion,
      cliente: clienteConfirmacion,
      tipoPago: tipoPagoConfirmacion,
    });
    mostrarExito("¡Productos cargados al carrito con éxito!");
    onCerrar();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in">
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto space-y-4">
        {/* Cabecera */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">Venta por Voz</h2>
              <p className="text-[11px] text-slate-500">Dicta los productos y el cliente</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* FASE 1: DICTADO Y CAPTURA */}
        {!ordenInterpretada ? (
          <div className="space-y-4">
            {/* Botón de Micrófono / Grabación */}
            {soportaVoz ? (
              <div className="text-center py-4 space-y-3">
                <button
                  type="button"
                  onClick={toggleEscucha}
                  className={`relative w-20 h-20 mx-auto rounded-full flex items-center justify-center transition-all shadow-lg active:scale-95 ${
                    escuchando
                      ? "bg-rose-600 text-white shadow-rose-600/40 animate-pulse ring-8 ring-rose-100"
                      : "bg-emerald-600 text-white shadow-emerald-600/30 hover:bg-emerald-700"
                  }`}
                >
                  <Mic className="w-9 h-9" />
                </button>
                <p className="text-xs font-bold text-slate-700">
                  {escuchando ? "🎙️ Escuchando... Habla ahora" : "Toca el micrófono para dictar"}
                </p>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                  Ejemplo: &quot;Dos arroces Diana, una leche Alquería para Marta fiado&quot;
                </p>
              </div>
            ) : (
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1">
                <p className="font-bold">Micrófono no soportado en este navegador</p>
                <p className="text-[11px]">
                  Puedes escribir la orden directamente en el cuadro de texto inferior:
                </p>
              </div>
            )}

            {/* Frase reconocida editable */}
            <div>
              <label htmlFor="voz-frase" className="block text-xs font-bold text-slate-700 mb-1">
                Frase reconocida (editable):
              </label>
              <textarea id="voz-frase"
                rows={3}
                value={textoVoz}
                onChange={(e) => setTextoVoz(e.target.value)}
                placeholder="Dicta con el botón o escribe aquí la orden..."
                className="w-full rounded-2xl border border-slate-300 p-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
              />
            </div>

            {/* Atajos de prueba rápidos */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                O prueba con una frase de ejemplo:
              </span>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setTextoVoz("Dos arroces diana y una leche para Marta en efectivo")
                  }
                  className="text-left text-xs text-slate-600 bg-slate-50 hover:bg-slate-100 p-2 rounded-xl border border-slate-200 truncate"
                >
                  &quot;Dos arroces diana y una leche para Marta en efectivo&quot;
                </button>
                <button
                  type="button"
                  onClick={() => setTextoVoz("Un aceite premier para Carlos fiado")}
                  className="text-left text-xs text-slate-600 bg-slate-50 hover:bg-slate-100 p-2 rounded-xl border border-slate-200 truncate"
                >
                  &quot;Un aceite premier para Carlos fiado&quot;
                </button>
              </div>
            </div>

            <button
              type="button"
              disabled={!textoVoz.trim()}
              onClick={procesarInterpretacion}
              className={`flex items-center justify-center gap-2 w-full rounded-2xl py-3.5 text-sm font-bold text-white shadow-md active:scale-95 transition-all min-h-[48px] ${
                !textoVoz.trim()
                  ? "bg-slate-300 cursor-not-allowed"
                  : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20"
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Interpretar y revisar orden</span>
            </button>
          </div>
        ) : (
          /* FASE 2: MODAL DE CONFIRMACIÓN OBLIGATORIO */
          <div className="space-y-4 animate-in fade-in">
            <div className="rounded-2xl bg-emerald-50/80 border border-emerald-200 p-3 text-xs text-emerald-900">
              <p className="font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Revisa la orden antes de cargar al carrito</span>
              </p>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                Verifica las cantidades, el cliente y el método de pago detectado.
              </p>
            </div>

            {/* Aviso de palabras no reconocidas */}
            {ordenInterpretada.no_reconocidos && ordenInterpretada.no_reconocidos.length > 0 && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800">
                <span className="font-bold">No se reconoció: </span>
                <span>{ordenInterpretada.no_reconocidos.join(", ")}</span>
              </div>
            )}

            {/* Lista de productos detectados con edición */}
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 px-1 block">
                Productos detectados ({itemsConfirmacion.length}):
              </span>

              {itemsConfirmacion.length === 0 ? (
                <p className="text-xs text-rose-600 py-2 text-center">
                  No se detectaron productos válidos.
                </p>
              ) : (
                <div className="space-y-2 divide-y divide-slate-100">
                  {itemsConfirmacion.map((item, idx) => (
                    <div
                      key={item.producto.id}
                      className="pt-2 first:pt-0 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-slate-900 block truncate">
                          {item.producto.nombre}
                        </span>
                        <span className="text-slate-400 text-[11px]">
                          {formatoCOP(
                            Math.round(item.producto.precio * (1 + item.producto.iva / 100)),
                          )}{" "}
                          c/u
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => cambiarCantidad(idx, -1)}
                          className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700 active:scale-90"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-6 text-center font-black text-sm text-slate-900">
                          {item.cantidad}
                        </span>
                        <button
                          type="button"
                          onClick={() => cambiarCantidad(idx, 1)}
                          className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center text-white active:scale-90"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => eliminarItem(idx)}
                          className="p-1 text-slate-300 hover:text-rose-600 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cliente confirmado */}
            <div className="space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 px-1 block">
                Cliente asignado:
              </span>
              <select
                value={clienteConfirmacion ? clienteConfirmacion.id : ""}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  const cli = clientes.find((c) => c.id === id) || null;
                  setClienteConfirmacion(cli);
                }}
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Consumidor Final (Sin cliente específico)</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombres} ({c.documento})
                  </option>
                ))}
              </select>
            </div>

            {/* Método de pago confirmado */}
            <div className="space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 px-1 block">
                Método de pago:
              </span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTipoPagoConfirmacion("efectivo")}
                  className={`py-2 px-1 text-xs font-bold rounded-xl border flex flex-col items-center gap-1 ${
                    tipoPagoConfirmacion === "efectivo"
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                      : "bg-white text-slate-700 border-slate-200"
                  }`}
                >
                  <Banknote className="w-4 h-4" />
                  <span>Efectivo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTipoPagoConfirmacion("digital")}
                  className={`py-2 px-1 text-xs font-bold rounded-xl border flex flex-col items-center gap-1 ${
                    tipoPagoConfirmacion === "digital"
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                      : "bg-white text-slate-700 border-slate-200"
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  <span>QR Bre-B</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTipoPagoConfirmacion("fiado")}
                  className={`py-2 px-1 text-xs font-bold rounded-xl border flex flex-col items-center gap-1 ${
                    tipoPagoConfirmacion === "fiado"
                      ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                      : "bg-white text-slate-700 border-slate-200"
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Fiado</span>
                </button>
              </div>
            </div>

            {/* Botones de acción final de la confirmación */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={itemsConfirmacion.length === 0}
                onClick={finalizarCargaCarrito}
                className="flex items-center justify-center gap-2 w-full rounded-2xl bg-emerald-600 py-3.5 text-sm font-bold text-white shadow-md active:scale-95 transition-all hover:bg-emerald-700 min-h-[48px]"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Cargar orden al carrito</span>
              </button>

              <button
                type="button"
                onClick={() => setOrdenInterpretada(null)}
                className="w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-800 py-1"
              >
                ← Volver a dictar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
