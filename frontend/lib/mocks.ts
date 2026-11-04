import type {
  Cartera,
  Cliente,
  Producto,
  ResumenReporte,
  VentaDetalle,
  VentaResumen,
} from "./types";

export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

const p = (
  id: number,
  nombre: string,
  precio: number,
  iva: 0 | 19,
  stock: number,
  stock_minimo: number,
): Producto => ({ id, codigo: null, nombre, precio, iva, stock, stock_minimo, activo: true });

export const productos: Producto[] = [
  p(1, "Arroz Diana 500 g", 2400, 0, 40, 10),
  p(2, "Leche Alquería 1 L", 4200, 0, 24, 8),
  p(3, "Huevos AA x12", 9800, 0, 15, 5),
  p(4, "Aceite Premier 1 L", 11500, 19, 12, 4),
  p(5, "Pan tajado Bimbo", 5600, 0, 3, 5),
  p(6, "Gaseosa Postobón 1,5 L", 4800, 19, 30, 10),
  p(7, "Papas Margarita pollo", 2500, 19, 50, 12),
  p(8, "Jabón Rey barra", 2200, 19, 20, 6),
  p(9, "Café Sello Rojo 250 g", 8900, 0, 18, 5),
  p(10, "Panela cuadrada", 3100, 0, 2, 6),
];

export const clientes: Cliente[] = [
  { id: 1, tipo_documento: "13", documento: "52123456", nombres: "Marta Rodríguez", telefono: "3001234567", email: null, direccion: "Cra 7 # 12-30" },
  { id: 2, tipo_documento: "13", documento: "79654321", nombres: "Carlos Pérez", telefono: "3109876543", email: "carlos@correo.com", direccion: null },
  { id: 3, tipo_documento: "31", documento: "900123456", nombres: "Restaurante El Fogón", telefono: "3201112233", email: "fogon@correo.com", direccion: "Calle 20 # 5-10" },
];

const ahora = new Date().toISOString();

// Venta digital esperando pago (con recaudo y QR de 1 píxel)
export const ventaDigital: VentaDetalle = {
  id: 1,
  reference_code: "TFXX-VENTA-0001",
  tipo_pago: "digital",
  estado: "esperando_pago",
  total: 6600,
  cliente_id: null,
  due_date: null,
  created_at: ahora,
  saldo: 6600,
  cliente: null,
  items: [
    { id: 1, producto_id: 1, nombre: "Arroz Diana 500 g", cantidad: 1, precio: 2400, iva: 0 },
    { id: 2, producto_id: 2, nombre: "Leche Alquería 1 L", cantidad: 1, precio: 4200, iva: 0 },
  ],
  recaudos: [
    {
      id: 1,
      reference_code: "TFXX-VENTA-0001",
      tipo: "venta",
      monto: 6600,
      estado: "ready",
      breb_key: "@FAKE123",
      qr: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      qr_expires_at: null,
      collected_at: null,
    },
  ],
  documentos: [],
};

// Venta fiada con factura a crédito emitida
export const ventaFiado: VentaDetalle = {
  id: 2,
  reference_code: "TFXX-VENTA-0002",
  tipo_pago: "fiado",
  estado: "fiado_abierto",
  total: 27370,
  cliente_id: 1,
  due_date: "2026-12-15",
  created_at: ahora,
  saldo: 27370,
  cliente: clientes[0],
  items: [
    { id: 3, producto_id: 4, nombre: "Aceite Premier 1 L", cantidad: 2, precio: 11500, iva: 19 },
  ],
  recaudos: [],
  documentos: [
    {
      id: 1,
      tipo: "factura",
      reference_code: "TFXX-VENTA-0002",
      numero: "FAKE-0001",
      cufe: "fake-cufe-tfxx-venta-0002",
      is_validated: true,
      public_url: null,
      factura_origen_id: null,
      errores: null,
    },
  ],
};

const resumenDe = (v: VentaDetalle): VentaResumen => ({
  id: v.id,
  reference_code: v.reference_code,
  tipo_pago: v.tipo_pago,
  estado: v.estado,
  total: v.total,
  cliente_id: v.cliente_id,
  due_date: v.due_date,
  created_at: v.created_at,
});

const cartera: Cartera = {
  cliente: clientes[0],
  saldo_total: 27370,
  ventas: [
    {
      venta_id: 2,
      reference_code: "TFXX-VENTA-0002",
      total: 27370,
      abonado: 0,
      saldo: 27370,
      due_date: "2026-12-15",
    },
  ],
};

const reporte: ResumenReporte = {
  ventas_hoy: 2,
  total_hoy: 33970,
  fiado_pendiente: 27370,
  productos_bajo_stock: productos.filter((x) => x.stock <= x.stock_minimo),
};

/**
 * Devuelve datos falsos para (método, ruta) cuando NEXT_PUBLIC_USE_MOCKS=true.
 * Devuelve undefined si no hay mock para esa ruta o si los mocks están apagados.
 */
export function getMock(method: string, path: string): unknown | undefined {
  if (!USE_MOCKS) return undefined;
  const ruta = path.split("?")[0];
  const m = method.toUpperCase();

  if (m === "POST" && ruta === "/api/auth/login") return { token: "mock-token" };
  if (m === "GET" && ruta === "/api/health") return { status: "ok", factus_mode: "fake" };
  if (m === "GET" && ruta === "/api/productos") return productos;
  if (m === "GET" && ruta === "/api/clientes") return clientes;
  if (m === "GET" && ruta === "/api/ventas") return [ventaDigital, ventaFiado].map(resumenDe);
  if (m === "GET" && ruta === "/api/reportes/resumen") return reporte;
  if (m === "GET" && /^\/api\/clientes\/\d+\/cartera$/.test(ruta)) return cartera;
  if (m === "GET" && ruta === "/api/ventas/1") return ventaDigital;
  if (m === "GET" && ruta === "/api/ventas/2") return ventaFiado;
  if (m === "POST" && ruta === "/api/ventas") return ventaDigital;
  if (m === "POST" && /^\/api\/ventas\/\d+\/refrescar-pago$/.test(ruta)) return ventaDigital;
  return undefined;
}
