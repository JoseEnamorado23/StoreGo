"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogIn, KeyRound, Mail, Sparkles } from "lucide-react";
import { api, guardarToken, ApiError } from "@/lib/api";
import { useAlerta } from "@/components/AlertaContext";
import { USE_MOCKS } from "@/lib/mocks";

export default function PaginaLogin() {
  const router = useRouter();
  const { mostrarExito, mostrarError, ejecutarConCarga } = useAlerta();

  const [email, setEmail] = useState("admin@tiendafacil.test");
  const [password, setPassword] = useState("admin123");
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorLocal(null);

    if (!email.trim() || !password.trim()) {
      setErrorLocal("Por favor ingresa tu correo y tu contraseña.");
      return;
    }

    const res = await ejecutarConCarga(async () => {
      return await api.login(email.trim(), password);
    }, "Validando credenciales...");

    if (res && res.token) {
      guardarToken(res.token);
      mostrarExito("¡Bienvenido a StoreGo!");
      router.push("/vender");
    } else if (!res) {
      setErrorLocal("El correo o la contraseña no coinciden. Intenta de nuevo.");
    }
  };

  const llenarPrueba = () => {
    setEmail("admin@tiendafacil.test");
    setPassword("admin123");
    setErrorLocal(null);
  };

  return (
    <div className="mx-auto w-full max-w-md flex flex-col justify-center min-h-[75vh] py-8">
      <div className="flex flex-col items-center text-center mb-8">
        <div className="relative w-52 h-16 mb-2">
          <Image
            src="/logo.png"
            alt="StoreGo"
            fill
            className="object-contain"
            priority
          />
        </div>
        <p className="text-sm text-slate-500 font-medium">
          Acceso para el tendero
        </p>
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80">
        <h2 className="text-xl font-bold text-slate-900 mb-1">Iniciar sesión</h2>
        <p className="text-xs text-slate-500 mb-6">
          Ingresa tus datos para abrir el punto de venta de tu tienda.
        </p>

        {errorLocal && (
          <div
            role="alert"
            className="mb-5 rounded-2xl bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-800 font-medium leading-relaxed"
          >
            {errorLocal}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              Correo electrónico
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ejemplo@tienda.com"
                className="w-full rounded-2xl border border-slate-300 bg-slate-50/50 pl-11 pr-4 py-3.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              Contraseña
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-2xl border border-slate-300 bg-slate-50/50 pl-11 pr-4 py-3.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>
          </div>

          <button
            type="submit"
            className="flex items-center justify-center gap-2 w-full rounded-2xl bg-emerald-600 py-4 text-base font-bold text-white shadow-md shadow-emerald-600/20 active:scale-98 transition-all hover:bg-emerald-700 min-h-[52px] mt-2"
          >
            <LogIn className="w-5 h-5" />
            <span>Entrar a mi tienda</span>
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={llenarPrueba}
            className="inline-flex items-center gap-1.5 text-xs text-emerald-700 hover:text-emerald-800 font-semibold p-1"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Llenar datos de prueba</span>
          </button>

          {USE_MOCKS && (
            <span className="text-[11px] text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              Modo simulación
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
