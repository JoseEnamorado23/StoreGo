"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { AlertCircle, CheckCircle2, Info, X, Loader2 } from "lucide-react";

export type TipoAlerta = "error" | "exito" | "info";

interface Alerta {
  id: string;
  tipo: TipoAlerta;
  mensaje: string;
}

interface AlertaContextType {
  mostrarError: (mensaje: string) => void;
  mostrarExito: (mensaje: string) => void;
  mostrarInfo: (mensaje: string) => void;
  cargando: boolean;
  mensajeCarga: string | null;
  setCargando: (estado: boolean, mensaje?: string) => void;
  ejecutarConCarga: <T>(accion: () => Promise<T>, mensaje?: string) => Promise<T | null>;
}

const AlertaContext = createContext<AlertaContextType | null>(null);

export function AlertaProvider({ children }: { children: React.ReactNode }) {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [cargando, setCargandoState] = useState(false);
  const [mensajeCarga, setMensajeCarga] = useState<string | null>(null);

  const eliminarAlerta = useCallback((id: string) => {
    setAlertas((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const agregarAlerta = useCallback((tipo: TipoAlerta, mensaje: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setAlertas((prev) => [...prev, { id, tipo, mensaje }]);

    // Auto-eliminar después de 5 segundos
    setTimeout(() => {
      setAlertas((prev) => prev.filter((a) => a.id !== id));
    }, 5000);
  }, []);

  const mostrarError = useCallback((mensaje: string) => {
    agregarAlerta("error", mensaje);
  }, [agregarAlerta]);

  const mostrarExito = useCallback((mensaje: string) => {
    agregarAlerta("exito", mensaje);
  }, [agregarAlerta]);

  const mostrarInfo = useCallback((mensaje: string) => {
    agregarAlerta("info", mensaje);
  }, [agregarAlerta]);

  const setCargando = useCallback((estado: boolean, mensaje?: string) => {
    setCargandoState(estado);
    setMensajeCarga(mensaje ?? null);
  }, []);

  const ejecutarConCarga = useCallback(async <T,>(accion: () => Promise<T>, mensaje?: string): Promise<T | null> => {
    try {
      setCargandoState(true);
      setMensajeCarga(mensaje ?? "Cargando...");
      const res = await accion();
      return res;
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Ocurrió un error inesperado. Intenta de nuevo.";
      agregarAlerta("error", errorMsg);
      return null;
    } finally {
      setCargandoState(false);
      setMensajeCarga(null);
    }
  }, [agregarAlerta]);

  return (
    <AlertaContext.Provider
      value={{
        mostrarError,
        mostrarExito,
        mostrarInfo,
        cargando,
        mensajeCarga,
        setCargando,
        ejecutarConCarga,
      }}
    >
      {children}

      {/* Alertas flotantes arriba de la pantalla */}
      <div className="fixed top-3 inset-x-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none max-w-md mx-auto">
        {alertas.map((a) => {
          const esError = a.tipo === "error";
          const esExito = a.tipo === "exito";
          return (
            <div
              key={a.id}
              role="alert"
              className={`pointer-events-auto flex w-full items-start gap-3 rounded-xl p-3.5 shadow-lg border transition-all duration-200 animate-in fade-in slide-in-from-top-2 ${
                esError
                  ? "bg-rose-50 border-rose-200 text-rose-900"
                  : esExito
                  ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                  : "bg-sky-50 border-sky-200 text-sky-900"
              }`}
            >
              <div className="shrink-0 mt-0.5">
                {esError ? (
                  <AlertCircle className="w-5 h-5 text-rose-600" />
                ) : esExito ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                ) : (
                  <Info className="w-5 h-5 text-sky-600" />
                )}
              </div>
              <div className="flex-1 text-sm font-medium leading-snug">{a.mensaje}</div>
              <button
                type="button"
                onClick={() => eliminarAlerta(a.id)}
                className="shrink-0 p-1 -mr-1 -mt-1 text-slate-400 hover:text-slate-700 rounded-lg"
                aria-label="Cerrar aviso"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Overlay global de carga */}
      {cargando && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4"
        >
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 max-w-xs w-full text-center">
            <Loader2 className="w-10 h-10 animate-spin text-emerald-600" />
            <p className="text-base font-semibold text-slate-800">
              {mensajeCarga || "Procesando..."}
            </p>
            <p className="text-xs text-slate-500">Un momento por favor...</p>
          </div>
        </div>
      )}
    </AlertaContext.Provider>
  );
}

export function useAlerta() {
  const context = useContext(AlertaContext);
  if (!context) {
    throw new Error("useAlerta debe usarse dentro de un AlertaProvider");
  }
  return context;
}
