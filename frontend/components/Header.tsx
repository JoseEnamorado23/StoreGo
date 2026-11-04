"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LogOut,
  ShoppingBag,
  Receipt,
  BookOpen,
  Package,
  BarChart3,
} from "lucide-react";
import { cerrarSesion, leerToken } from "@/lib/api";
import { USE_MOCKS } from "@/lib/mocks";

const NAVEGACION_DESKTOP = [
  { href: "/vender", etiqueta: "Vender", Icono: ShoppingBag },
  { href: "/ventas", etiqueta: "Ventas", Icono: Receipt },
  { href: "/fiados", etiqueta: "Fiados", Icono: BookOpen },
  { href: "/inventario", etiqueta: "Inventario", Icono: Package },
  { href: "/resumen", etiqueta: "Resumen", Icono: BarChart3 },
];

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [autenticado, setAutenticado] = useState(false);

  useEffect(() => {
    setAutenticado(!!leerToken());
  }, [pathname]);

  if (pathname === "/login" || pathname === "/") return null;

  const handleCerrarSesion = () => {
    if (confirm("¿Deseas cerrar la sesión de tu tienda?")) {
      cerrarSesion();
      setAutenticado(false);
      router.push("/login");
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 py-3">
        {/* Logo & Marca */}
        <div className="flex items-center gap-6">
          <Link href="/vender" className="flex items-center gap-2">
            <div className="relative h-8 w-28">
              <Image
                src="/logo.png"
                alt="StoreGo"
                fill
                className="object-contain object-left"
                priority
              />
            </div>
          </Link>

          {/* Menú de navegación en escritorio (Minimalista) */}
          <nav aria-label="Navegación de escritorio" className="hidden md:flex items-center gap-1">
            {NAVEGACION_DESKTOP.map(({ href, etiqueta, Icono }) => {
              const activo = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                    activo
                      ? "bg-slate-900 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                  }`}
                >
                  <Icono className={`w-4 h-4 ${activo ? "text-emerald-400" : "text-slate-400"}`} />
                  <span>{etiqueta}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Acciones de usuario & estado */}
        <div className="flex items-center gap-3">
          {USE_MOCKS && (
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 border border-amber-200/80">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              Modo Pruebas (Sin backend)
            </span>
          )}

          {autenticado && (
            <button
              type="button"
              onClick={handleCerrarSesion}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 active:scale-95 transition-all shadow-2xs"
              title="Cerrar sesión"
            >
              <LogOut className="h-3.5 w-3.5 text-slate-400" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
