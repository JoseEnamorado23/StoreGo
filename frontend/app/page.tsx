"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBag, ArrowRight } from "lucide-react";
import { leerToken } from "@/lib/api";

export default function Inicio() {
  const router = useRouter();
  const [tokenPresente, setTokenPresente] = useState(false);

  useEffect(() => {
    const t = leerToken();
    if (t) {
      setTokenPresente(true);
      router.replace("/vender");
    }
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-2">
      <div className="relative w-64 h-24 mb-6">
        <Image
          src="/logo.png"
          alt="StoreGo"
          fill
          className="object-contain"
          priority
        />
      </div>

      <h1 className="text-2xl font-black tracking-tight text-slate-800">
        Tu tienda de barrio, fácil y moderna
      </h1>
      <p className="mt-2 text-sm text-slate-600 max-w-xs leading-relaxed">
        Registra tus ventas rápido, controla tus fiados, cobra con código QR y emite factura electrónica sin complicaciones.
      </p>

      <div className="mt-8 w-full max-w-xs space-y-3">
        {tokenPresente ? (
          <Link
            href="/vender"
            className="flex items-center justify-center gap-2 w-full rounded-2xl bg-emerald-600 py-4 text-base font-bold text-white shadow-lg shadow-emerald-600/30 active:scale-98 transition-all hover:bg-emerald-700 min-h-[52px]"
          >
            <ShoppingBag className="w-5 h-5" />
            <span>Continuar vendiendo</span>
            <ArrowRight className="w-5 h-5" />
          </Link>
        ) : (
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 w-full rounded-2xl bg-emerald-600 py-4 text-base font-bold text-white shadow-lg shadow-emerald-600/30 active:scale-98 transition-all hover:bg-emerald-700 min-h-[52px]"
          >
            <span>Entrar a mi tienda</span>
            <ArrowRight className="w-5 h-5" />
          </Link>
        )}
        <Link
          href="/archivos"
          className="flex items-center justify-center gap-2 w-full rounded-2xl border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 min-h-[48px]"
        >
          <span>Mis archivos (cuenta Cognito)</span>
        </Link>
      </div>

      <div className="mt-12 rounded-xl bg-emerald-50/80 p-3.5 border border-emerald-100 text-xs text-emerald-800 max-w-xs">
        <p className="font-semibold">Integrado con Factus</p>
        <p className="text-emerald-700 mt-0.5">Cobros QR Bre-B y Facturación Electrónica DIAN</p>
      </div>
    </div>
  );
}
