// Tipos equivalentes a docs/API_CONTRACT.md (mismos nombres snake_case).
// Los montos de dinero llegan como número.

export type TipoPago = "efectivo" | "digital" | "fiado";
export type EstadoVenta =
  | "esperando_pago"
  | "pagada"
  | "fiado_abierto"
  | "fiado_pagado"
  | "anulada";
export type TipoRecaudo = "venta" | "abono" | "diferencia";
export type EstadoRecaudo = "ready" | "paid" | "expired";
export type TipoDocumento = "factura" | "nota_credito" | "nota_debito";

export interface Producto {
  id: number;
  codigo: string | null;
  nombre: string;
  precio: number; // sin IVA
  iva: 0 | 19;
  stock: number;
  stock_minimo: number;
  activo: boolean;
}

export interface ProductoCreate {
  nombre: string;
  precio: number;
  iva: 0 | 19;
  stock: number;
  stock_minimo: number;
  codigo?: string;
}

export type ProductoUpdate = Partial<ProductoCreate> & { activo?: boolean };

export interface EntradaInventario {
  cantidad: number;
  nota?: string;
}

export interface Cliente {
  id: number;
  tipo_documento: string; // "13" CC, "31" NIT
  documento: string;
  nombres: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
}

export interface ClienteCreate {
  tipo_documento: string;
  documento: string;
  nombres: string;
  telefono?: string;
  email?: string;
  direccion?: string;
}

export interface CarteraVenta {
  venta_id: number;
  reference_code: string;
  total: number;
  abonado: number;
  saldo: number;
  due_date: string | null;
}

export interface Cartera {
  cliente: Cliente;
  saldo_total: number;
  ventas: CarteraVenta[];
}

export interface ItemIn {
  producto_id: number;
  cantidad: number;
}

export interface VentaCreate {
  tipo_pago: TipoPago;
  cliente_id?: number;
  items: ItemIn[];
  facturar?: boolean;
  due_date?: string; // YYYY-MM-DD
}

export interface VentaItem {
  id: number;
  producto_id: number;
  nombre: string;
  cantidad: number;
  precio: number;
  iva: number;
}

export interface Recaudo {
  id: number;
  reference_code: string;
  tipo: TipoRecaudo;
  monto: number; // entero COP
  estado: EstadoRecaudo;
  breb_key: string | null;
  qr: string | null; // data:image/png;base64,...
  qr_expires_at: string | null;
  collected_at: string | null;
}

export interface DocumentoElectronico {
  id: number;
  tipo: TipoDocumento;
  reference_code: string;
  numero: string | null;
  cufe: string | null;
  is_validated: boolean;
  public_url: string | null;
  factura_origen_id: number | null;
  errores: Record<string, unknown> | null;
}

export interface VentaResumen {
  id: number;
  reference_code: string;
  tipo_pago: TipoPago;
  estado: EstadoVenta;
  total: number;
  cliente_id: number | null;
  due_date: string | null;
  created_at: string;
}

export interface VentaDetalle extends VentaResumen {
  saldo: number;
  cliente: Cliente | null;
  items: VentaItem[];
  recaudos: Recaudo[];
  documentos: DocumentoElectronico[];
}

export interface AbonoIn {
  monto: number; // entero COP, 1000 a 12100000
}

export interface NotaCreditoIn {
  concepto: 1 | 2 | 5;
  items?: ItemIn[];
  observacion?: string;
}

export interface NotaDebitoIn {
  concepto: 1 | 3 | 4;
  items: ItemIn[];
  observacion?: string;
}

export interface VozItem {
  producto_id: number;
  nombre: string;
  cantidad: number;
  confianza: number;
}

export interface VozResultado {
  items: VozItem[];
  cliente: { id: number; nombres: string } | null;
  tipo_pago: TipoPago | null;
  no_reconocidos: string[];
}

export interface ResumenReporte {
  ventas_hoy: number;
  total_hoy: number;
  fiado_pendiente: number;
  productos_bajo_stock: Producto[];
}

export interface Health {
  status: "ok";
  factus_mode: "fake" | "real";
}

export interface Login {
  token: string;
}
