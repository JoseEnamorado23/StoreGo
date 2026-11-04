"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag, Receipt, BookOpen, Package, BarChart3 } from "lucide-react";

interface EnlaceNav {
  href: string;
  etiqueta: string;
  Icono: React.ComponentType<{ className?: string }>;
}

const ENLACES: EnlaceNav[] = [
  { href: "/vender", etiqueta: "Vender", Icono: ShoppingBag },
  { href: "/ventas", etiqueta: "Ventas", Icono: Receipt },
  { href: "/fiados", etiqueta: "Fiados", Icono: BookOpen },
  { href: "/inventario", etiqueta: "Inventario", Icono: Package },
  { href: "/resumen", etiqueta: "Resumen", Icono: BarChart3 },
];

export default function BottomNav() {
  const pathname = usePathname();

  // No mostrar barra en login ni landing
  if (pathname === "/login" || pathname === "/") return null;

  return (
    <nav
      aria-label="Navegación principal móvil"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/90 bg-white/95 backdrop-blur-md shadow-lg md:hidden"
    >
      <div className="mx-auto flex max-w-md items-center justify-around px-2 py-1.5">
        {ENLACES.map(({ href, etiqueta, Icono }) => {
          const activo = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center justify-center py-1.5 px-1 min-h-[52px] rounded-xl transition-colors ${
                activo
                  ? "text-emerald-700 font-bold bg-emerald-50/70"
                  : "text-slate-500 hover:text-slate-900 active:bg-slate-100 font-medium"
              }`}
            >
              <Icono className={`w-5 h-5 transition-transform ${activo ? "scale-110 text-emerald-600 stroke-[2.4]" : "stroke-[1.8]"}`} />
              <span className="text-[11px] leading-tight mt-1">{etiqueta}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
