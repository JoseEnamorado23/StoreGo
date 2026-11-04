import Link from "next/link";
import Titulo from "@/components/Titulo";

export default function Inicio() {
  return (
    <div className="space-y-4">
      <Titulo>Tienda Fácil</Titulo>
      <p className="text-slate-600">Ventas, inventario y fiados para tu tienda.</p>
      <Link
        href="/login"
        className="inline-block rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white"
      >
        Entrar
      </Link>
    </div>
  );
}
