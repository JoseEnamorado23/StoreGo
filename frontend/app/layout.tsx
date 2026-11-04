import type { Metadata, Viewport } from "next";
import BottomNav from "@/components/BottomNav";
import Header from "@/components/Header";
import { AlertaProvider } from "@/components/AlertaContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "StoreGo — Tienda Fácil",
  description: "Ventas, inventario, fiados, cobros con Factus Pay y factura electrónica para tiendas de barrio.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "StoreGo",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#047857",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full bg-slate-50">
      <head>
        <link rel="apple-touch-icon" href="/logo.png" />
      </head>
      <body className="flex min-h-full flex-col bg-slate-50 text-slate-900 antialiased selection:bg-emerald-100">
        <AlertaProvider>
          <div className="flex min-h-screen w-full flex-col">
            <Header />
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 lg:px-8 py-5 pb-24 md:pb-10">
              {children}
            </main>
            <BottomNav />
          </div>
        </AlertaProvider>
      </body>
    </html>
  );
}
