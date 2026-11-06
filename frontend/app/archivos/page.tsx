"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileText, LogIn, LogOut, ShieldCheck, Upload } from "lucide-react";
import { useAlerta } from "@/components/AlertaContext";
import {
  cerrarSesionCognito,
  iniciarSesionCognito,
  obtenerAccessToken,
} from "@/lib/cognito";
import {
  listarArchivos,
  subirArchivo,
  SesionVencidaError,
  TAMANO_MAXIMO,
  TIPOS_PERMITIDOS,
  type ArchivoRemoto,
} from "@/lib/archivosApi";

type Estado = "verificando" | "sin_sesion" | "con_sesion";

function kb(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PaginaArchivos() {
  const { mostrarError, mostrarExito, ejecutarConCarga } = useAlerta();
  const [estado, setEstado] = useState<Estado>("verificando");
  const [archivos, setArchivos] = useState<ArchivoRemoto[]>([]);
  const entrada = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    try {
      setArchivos(await listarArchivos());
    } catch (e) {
      if (e instanceof SesionVencidaError) {
        setEstado("sin_sesion");
      } else {
        mostrarError(e instanceof Error ? e.message : "No se pudo cargar la lista.");
      }
    }
  }, [mostrarError]);

  useEffect(() => {
    let activo = true;
    (async () => {
      const token = await obtenerAccessToken();
      if (!activo) return;
      if (!token) {
        setEstado("sin_sesion");
        return;
      }
      setEstado("con_sesion");
      await cargar();
    })();
    return () => {
      activo = false;
    };
  }, [cargar]);

  const alSeleccionar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    const ok = await ejecutarConCarga(async () => {
      await subirArchivo(archivo);
      return true;
    }, "Subiendo archivo...");
    if (entrada.current) entrada.current.value = "";
    if (ok) {
      mostrarExito("Archivo subido a tu espacio privado.");
      await cargar();
    }
  };

  if (estado === "verificando") {
    return <p className="py-16 text-center text-sm text-slate-500">Verificando sesión...</p>;
  }

  if (estado === "sin_sesion") {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center text-center">
        <ShieldCheck className="mb-3 h-10 w-10 text-emerald-600" />
        <h1 className="text-xl font-bold text-slate-900">Mis archivos privados</h1>
        <p className="mt-2 mb-6 text-sm text-slate-600">
          Inicia sesión con tu cuenta de Amazon Cognito para ver y subir archivos. Solo tú puedes
          acceder a ellos.
        </p>
        <button
          type="button"
          onClick={() => iniciarSesionCognito().catch(() => mostrarError("No se pudo abrir el login."))}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-4 text-base font-bold text-white shadow-md shadow-emerald-600/20 transition-all hover:bg-emerald-700"
        >
          <LogIn className="h-5 w-5" />
          <span>Iniciar sesión con Cognito</span>
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Mis archivos privados</h1>
        <button
          type="button"
          onClick={async () => {
            await cerrarSesionCognito();
          }}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          <LogOut className="h-3.5 w-3.5 text-slate-400" />
          <span>Cerrar sesión de Cognito</span>
        </button>
      </div>

      <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <p className="mb-3 text-xs text-slate-500">
          PDF, PNG, JPG o TXT, de hasta {kb(TAMANO_MAXIMO)}. Los archivos se guardan en un bucket
          S3 privado y solo se acceden con enlaces temporales de 5 minutos.
        </p>
        <label className="flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 px-4 py-4 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">
          <Upload className="h-5 w-5" />
          <span>Elegir archivo para subir</span>
          <input
            ref={entrada}
            type="file"
            accept={TIPOS_PERMITIDOS.join(",")}
            onChange={alSeleccionar}
            className="hidden"
          />
        </label>
      </div>

      <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-slate-800">Tus archivos</h2>
        {archivos.length === 0 ? (
          <p className="text-sm text-slate-500">Aún no has subido archivos.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {archivos.map((a) => (
              <li key={a.key} className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <FileText className="h-5 w-5 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {a.key.split("/").slice(1).join("/")}
                    </p>
                    <p className="text-xs text-slate-500">{kb(a.tamano)}</p>
                  </div>
                </div>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Descargar</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
