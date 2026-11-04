import type { Metadata, Viewport } from "next";
import BottomNav from "@/components/BottomNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tienda Fácil",
  description: "Ventas, inventario y fiados para tiendas de barrio",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <main className="mx-auto min-h-screen max-w-md px-4 pb-24 pt-6">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
