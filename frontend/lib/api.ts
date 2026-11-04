import { getMock } from "./mocks";
import type {
  AbonoIn,
  Cartera,
  Cliente,
  ClienteCreate,
  EntradaInventario,
  Health,
  Login,
  NotaCreditoIn,
  NotaDebitoIn,
  Producto,
  ProductoCreate,
  ProductoUpdate,
  ResumenReporte,
  VentaCreate,
  VentaDetalle,
  VentaResumen,
  VozResultado,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "tienda_facil_token";

export function guardarToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function leerToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function cerrarSesion(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const mock = getMock(method, path);
  if (mock !== undefined) return mock as T;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = leerToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detalle = res.statusText;
    try {
      const data = await res.json();
      if (typeof data.detail === "string") detalle = data.detail;
    } catch {
      // la respuesta no era JSON
    }
    throw new ApiError(res.status, detalle);
  }
  return (await res.json()) as T;
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const api = {
  health: () => request<Health>("GET", "/api/health"),
  login: (email: string, password: string) =>
    request<Login>("POST", "/api/auth/login", { email, password }),

  listarProductos: (f: { q?: string; bajo_stock?: boolean } = {}) =>
    request<Producto[]>("GET", `/api/productos${qs(f)}`),
  crearProducto: (d: ProductoCreate) => request<Producto>("POST", "/api/productos", d),
  actualizarProducto: (id: number, d: ProductoUpdate) =>
    request<Producto>("PUT", `/api/productos/${id}`, d),
  entradaProducto: (id: number, d: EntradaInventario) =>
    request<Producto>("POST", `/api/productos/${id}/entrada`, d),

  listarClientes: (q?: string) => request<Cliente[]>("GET", `/api/clientes${qs({ q })}`),
  crearCliente: (d: ClienteCreate) => request<Cliente>("POST", "/api/clientes", d),
  cartera: (id: number) => request<Cartera>("GET", `/api/clientes/${id}/cartera`),

  crearVenta: (d: VentaCreate) => request<VentaDetalle>("POST", "/api/ventas", d),
  listarVentas: (f: { estado?: string; cliente_id?: number } = {}) =>
    request<VentaResumen[]>("GET", `/api/ventas${qs(f)}`),
  venta: (id: number) => request<VentaDetalle>("GET", `/api/ventas/${id}`),
  refrescarPago: (id: number) =>
    request<VentaDetalle>("POST", `/api/ventas/${id}/refrescar-pago`),
  crearAbono: (id: number, d: AbonoIn) =>
    request<VentaDetalle>("POST", `/api/ventas/${id}/abonos`, d),
  notaCredito: (id: number, d: NotaCreditoIn) =>
    request<VentaDetalle>("POST", `/api/ventas/${id}/nota-credito`, d),
  notaDebito: (id: number, d: NotaDebitoIn) =>
    request<VentaDetalle>("POST", `/api/ventas/${id}/nota-debito`, d),

  interpretarVoz: (texto: string) =>
    request<VozResultado>("POST", "/api/voz/interpretar", { texto }),
  resumen: () => request<ResumenReporte>("GET", "/api/reportes/resumen"),

  // Solo con FACTUS_MODE=fake en el backend
  simularPago: (referenceCode: string) =>
    request<{ ok: boolean }>("POST", `/api/dev/simular-pago/${referenceCode}`),
};
