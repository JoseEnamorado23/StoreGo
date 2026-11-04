"use client";

import { useEffect, useState, useRef } from "react";
import {
  QrCode,
  Copy,
  Check,
  RefreshCw,
  Clock,
  X,
  AlertCircle,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatoCOP } from "@/lib/format";
import { useAlerta } from "@/components/AlertaContext";
import { USE_MOCKS } from "@/lib/mocks";
import type { VentaDetalle, Recaudo } from "@/lib/types";

interface ModalCobroQRProps {
  venta: VentaDetalle;
  onPagoConfirmado: (ventaActualizada: VentaDetalle) => void;
  onCerrar: () => void;
}

export default function ModalCobroQR({
  venta,
  onPagoConfirmado,
  onCerrar,
}: ModalCobroQRProps) {
  const { mostrarExito, mostrarInfo, mostrarError } = useAlerta();

  // El recaudo asociado a esta venta
  const recaudo: Recaudo | undefined =
    venta.recaudos.find((r) => r.tipo === "venta" && r.estado === "ready") ||
    venta.recaudos[0];

  const [copiado, setCopiado] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [tiempoRestante, setTiempoRestante] = useState<string>("Calculando...");
  const [expirado, setExpirado] = useState(false);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Parsear fecha de vencimiento (soporta ISO y formato Factus Pay DD-MM-YYYY hh:mm:ss AM/PM)
  const parsearExpiracion = (fechaStr: string | null): Date | null => {
    if (!fechaStr) return null;
    const d = new Date(fechaStr);
    if (!isNaN(d.getTime())) return d;

    const m = fechaStr.match(
      /^(\d{2})-(\d{2})-(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$/i,
    );
    if (m) {
      const [, dia, mes, anio, horas, mins, segs, ampm] = m;
      let h = parseInt(horas, 10);
      if (ampm?.toUpperCase() === "PM" && h < 12) h += 12;
      if (ampm?.toUpperCase() === "AM" && h === 12) h = 0;
      return new Date(
        parseInt(anio, 10),
        parseInt(mes, 10) - 1,
        parseInt(dia, 10),
        h,
        parseInt(mins, 10),
        parseInt(segs, 10),
      );
    }
    return null;
  };

  // Contador regresivo
  useEffect(() => {
    if (!recaudo?.qr_expires_at) {
      // Si no viene fecha, asumimos 24 horas por defecto según Factus Pay
      setTiempoRestante("Válido por 24 horas");
      return;
    }

    const fechaLimite = parsearExpiracion(recaudo.qr_expires_at);
    if (!fechaLimite) {
      setTiempoRestante("Válido por 24 horas");
      return;
    }

    const actualizarContador = () => {
      const ahora = new Date().getTime();
      const diff = fechaLimite.getTime() - ahora;

      if (diff <= 0) {
        setTiempoRestante("Código expirado");
        setExpirado(true);
        return;
      }

      const horas = Math.floor(diff / (1000 * 60 * 60));
      const minutos = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const segundos = Math.floor((diff % (1000 * 60)) / 1000);

      const hStr = horas > 0 ? `${horas}h ` : "";
      const mStr = `${minutos.toString().padStart(2, "0")}m `;
      const sStr = `${segundos.toString().padStart(2, "0")}s`;
      setTiempoRestante(`${hStr}${mStr}${sStr}`);
    };

    actualizarContador();
    const interval = setInterval(actualizarContador, 1000);
    return () => clearInterval(interval);
  }, [recaudo?.qr_expires_at]);

  // Polling cada 3 segundos a GET /api/ventas/{id}
  useEffect(() => {
    const consultarEstado = async () => {
      try {
        const vActualizada = await api.venta(venta.id);
        if (vActualizada.estado === "pagada") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          onPagoConfirmado(vActualizada);
        }
      } catch {
        // Silencioso en polling de fondo
      }
    };

    pollingRef.current = setInterval(consultarEstado, 3000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [venta.id, onPagoConfirmado]);

  // Copiar llave Bre-B
  const handleCopiarLlave = async () => {
    if (!recaudo?.breb_key) return;
    try {
      await navigator.clipboard.writeText(recaudo.breb_key);
      setCopiado(true);
      mostrarExito("¡Llave Bre-B copiada al portapapeles!");
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      mostrarInfo(`Llave Bre-B: ${recaudo.breb_key}`);
    }
  };

  // Botón "Ya pagó, verificar" -> POST /api/ventas/{id}/refrescar-pago
  const handleRefrescarPago = async () => {
    setVerificando(true);
    try {
      const v = await api.refrescarPago(venta.id);
      if (v.estado === "pagada") {
        if (pollingRef.current) clearInterval(pollingRef.current);
        onPagoConfirmado(v);
      } else {
        mostrarInfo(
          "El pago aún no se refleja en Factus Pay. Espera unos segundos mientras la red bancaria lo procesa.",
        );
      }
    } catch (err: unknown) {
      mostrarError(
        err instanceof Error ? err.message : "Error al consultar estado en Factus Pay",
      );
    } finally {
      setVerificando(false);
    }
  };

  // Botón Simular Pago (útil para pruebas y modo fake)
  const handleSimularDev = async () => {
    setVerificando(true);
    try {
      await api.simularPago(venta.reference_code);
      const v = await api.refrescarPago(venta.id);
      if (v.estado === "pagada") {
        if (pollingRef.current) clearInterval(pollingRef.current);
        onPagoConfirmado(v);
      }
    } catch (err: unknown) {
      mostrarError(
        err instanceof Error ? err.message : "No se pudo simular el pago en dev",
      );
    } finally {
      setVerificando(false);
    }
  };

  const monto = recaudo ? recaudo.monto : venta.total;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in">
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 max-h-[95vh] overflow-y-auto space-y-4">
        {/* Cabecera del modal */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">Cobro con Factus Pay</h2>
              <p className="text-[11px] text-slate-500 font-mono">
                {venta.reference_code}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Monto destacado */}
        <div className="rounded-2xl bg-emerald-50/90 border border-emerald-200 p-3.5 text-center">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 block">
            Monto a pagar
          </span>
          <span className="text-3xl font-black text-emerald-900 tracking-tight">
            {formatoCOP(monto)}
          </span>
          <span className="text-[10px] text-emerald-700 block mt-0.5">
            Interoperable con cualquier app bancaria o billetera digital
          </span>
        </div>

        {/* Imagen grande del Código QR */}
        <div className="text-center space-y-2">
          <div className="relative inline-block mx-auto rounded-3xl p-3 bg-white border-2 border-slate-200 shadow-sm">
            {recaudo?.qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={recaudo.qr}
                alt="Código QR Factus Pay"
                className="w-52 h-52 mx-auto object-contain rounded-xl"
              />
            ) : (
              <div className="w-52 h-52 flex flex-col items-center justify-center bg-slate-100 text-slate-400 rounded-xl">
                <QrCode className="w-16 h-16 mb-2 text-slate-300" />
                <span className="text-xs">Generando código QR...</span>
              </div>
            )}
          </div>

          <p className="text-xs font-semibold text-slate-600">
            Pídele al cliente que escanee este QR desde su app bancaria
          </p>
        </div>

        {/* Llave Bre-B con botón de copiar */}
        {recaudo?.breb_key && (
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              O paga con Llave Bre-B
            </span>
            <div className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200">
              <span className="font-mono text-xs font-bold text-slate-900 select-all truncate">
                {recaudo.breb_key}
              </span>
              <button
                type="button"
                onClick={handleCopiarLlave}
                className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  copiado
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-900 text-white hover:bg-slate-800"
                }`}
              >
                {copiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiado ? "Copiada" : "Copiar"}</span>
              </button>
            </div>
          </div>
        )}

        {/* Contador regresivo y estado del polling */}
        <div className="flex items-center justify-between text-xs px-1 text-slate-500">
          <div className="flex items-center gap-1.5">
            <Clock className={`w-3.5 h-3.5 ${expirado ? "text-rose-500" : "text-amber-500"}`} />
            <span className={expirado ? "text-rose-600 font-bold" : ""}>
              {tiempoRestante}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-emerald-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span>Esperando pago (auto)...</span>
          </div>
        </div>

        {/* Botones de acción */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            disabled={verificando}
            onClick={handleRefrescarPago}
            className="flex items-center justify-center gap-2 w-full rounded-2xl bg-emerald-600 py-3.5 text-sm font-bold text-white shadow-md shadow-emerald-600/20 active:scale-95 transition-all hover:bg-emerald-700 min-h-[50px]"
          >
            <RefreshCw className={`w-4 h-4 ${verificando ? "animate-spin" : ""}`} />
            <span>{verificando ? "Consultando..." : "Ya pagó, verificar"}</span>
          </button>

          {/* Atajo de simulación para desarrollo y pruebas */}
          <button
            type="button"
            disabled={verificando}
            onClick={handleSimularDev}
            className="flex items-center justify-center gap-1.5 w-full rounded-xl bg-amber-50 border border-amber-200 py-2.5 text-xs font-bold text-amber-800 hover:bg-amber-100 active:scale-95 transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>Simular pago inmediato (Pruebas)</span>
          </button>

          <button
            type="button"
            onClick={onCerrar}
            className="w-full text-center text-xs font-semibold text-slate-400 hover:text-slate-700 py-1"
          >
            Cambiar forma de pago / Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
