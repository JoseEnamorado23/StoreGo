"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ENLACES = [
  { href: "/vender", etiqueta: "Vender" },
  { href: "/ventas", etiqueta: "Ventas" },
  { href: "/fiados", etiqueta: "Fiados" },
  { href: "/inventario", etiqueta: "Inventario" },
  { href: "/resumen", etiqueta: "Resumen" },
];

export default function BottomNav() {
  const pathname = usePathname();
  if (pathname === "/login" || pathname === "/") return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white">
      <ul className="mx-auto flex max-w-md">
        {ENLACES.map(({ href, etiqueta }) => {
          const activo = pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={`block py-3 text-center text-xs font-medium ${
                  activo ? "text-emerald-600" : "text-slate-500"
                }`}
              >
                {etiqueta}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
