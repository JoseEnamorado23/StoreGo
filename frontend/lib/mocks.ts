import type {
  AbonoIn,
  Cartera,
  Cliente,
  ClienteCreate,
  DocumentoElectronico,
  EntradaInventario,
  NotaCreditoIn,
  NotaDebitoIn,
  Producto,
  ProductoCreate,
  ProductoUpdate,
  Recaudo,
  ResumenReporte,
  TipoPago,
  VentaCreate,
  VentaDetalle,
  VentaItem,
  VentaResumen,
  VozItem,
  VozResultado,
} from "./types";

export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

const p = (
  id: number,
  nombre: string,
  precio: number,
  iva: 0 | 19,
  stock: number,
  stock_minimo: number,
  codigo: string | null = null,
): Producto => ({ id, codigo, nombre, precio, iva, stock, stock_minimo, activo: true });

export const productos: Producto[] = [
  p(1, "Arroz Diana 500 g", 2400, 0, 40, 10, "ARR-01"),
  p(2, "Leche Alquería 1 L", 4200, 0, 24, 8, "LEC-01"),
  p(3, "Huevos AA x12", 9800, 0, 15, 5, "HUE-01"),
  p(4, "Aceite Premier 1 L", 11500, 19, 12, 4, "ACE-01"),
  p(5, "Pan tajado Bimbo", 5600, 0, 3, 5, "PAN-01"), // Bajo stock
  p(6, "Gaseosa Postobón 1,5 L", 4800, 19, 30, 10, "GAS-01"),
  p(7, "Papas Margarita pollo", 2500, 19, 50, 12, "PAP-01"),
  p(8, "Jabón Rey barra", 2200, 19, 20, 6, "JAB-01"),
  p(9, "Café Sello Rojo 250 g", 8900, 0, 18, 5, "CAF-01"),
  p(10, "Panela cuadrada", 3100, 0, 2, 6, "PAN-02"), // Bajo stock
];

export const clientes: Cliente[] = [
  { id: 1, tipo_documento: "13", documento: "52123456", nombres: "Marta Rodríguez", telefono: "3001234567", email: null, direccion: "Cra 7 # 12-30" },
  { id: 2, tipo_documento: "13", documento: "79654321", nombres: "Carlos Pérez", telefono: "3109876543", email: "carlos@correo.com", direccion: null },
  { id: 3, tipo_documento: "31", documento: "900123456", nombres: "Restaurante El Fogón", telefono: "3201112233", email: "fogon@correo.com", direccion: "Calle 20 # 5-10" },
];

const ahora = new Date().toISOString();

// SVG QR limpio y escaneable de simulación
const FAKE_QR_BASE64 =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">' +
      '<rect width="200" height="200" fill="#ffffff"/>' +
      '<rect x="20" y="20" width="50" height="50" fill="#047857"/>' +
      '<rect x="30" y="30" width="30" height="30" fill="#ffffff"/>' +
      '<rect x="37" y="37" width="16" height="16" fill="#047857"/>' +
      '<rect x="130" y="20" width="50" height="50" fill="#047857"/>' +
      '<rect x="140" y="30" width="30" height="30" fill="#ffffff"/>' +
      '<rect x="147" y="37" width="16" height="16" fill="#047857"/>' +
      '<rect x="20" y="130" width="50" height="50" fill="#047857"/>' +
      '<rect x="30" y="140" width="30" height="30" fill="#ffffff"/>' +
      '<rect x="37" y="147" width="16" height="16" fill="#047857"/>' +
      '<rect x="85" y="25" width="15" height="15" fill="#0f172a"/>' +
      '<rect x="105" y="40" width="15" height="15" fill="#0f172a"/>' +
      '<rect x="85" y="60" width="30" height="15" fill="#0f172a"/>' +
      '<rect x="85" y="85" width="30" height="30" fill="#047857"/>' +
      '<rect x="25" y="85" width="45" height="15" fill="#0f172a"/>' +
      '<rect x="130" y="85" width="45" height="15" fill="#0f172a"/>' +
      '<rect x="130" y="115" width="20" height="20" fill="#0f172a"/>' +
      '<rect x="160" y="130" width="20" height="20" fill="#0f172a"/>' +
      '<rect x="85" y="140" width="20" height="40" fill="#0f172a"/>' +
      '<rect x="115" y="160" width="35" height="20" fill="#0f172a"/>' +
      '<rect x="160" y="160" width="20" height="20" fill="#0f172a"/>' +
      '<text x="100" y="195" font-family="sans-serif" font-size="9" font-weight="bold" fill="#047857" text-anchor="middle">FACTUS PAY • BRE-B</text>' +
      "</svg>",
  );

// Venta digital esperando pago
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
      breb_key: "@FC8UL6IPPXOA9QB6X48P",
      qr: FAKE_QR_BASE64,
      qr_expires_at: new Date(Date.now() + 86400000).toISOString(),
      collected_at: null,
    },
  ],
  documentos: [
    {
      id: 1,
      tipo: "factura",
      reference_code: "TFXX-VENTA-0001",
      numero: "SETP990033340",
      cufe: "fc3808945f893d56a297a7e1898701886134b22c836932c02f022731fa19348e7182142270fa3fb9d35d2d0",
      is_validated: true,
      public_url: "https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=fc3808945f893d56a297a7e1898701886134b22c836932c02f022731fa19348e7182142270fa3fb9d35d2d0",
      factura_origen_id: null,
      errores: null,
    },
  ],
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
      id: 2,
      tipo: "factura",
      reference_code: "TFXX-VENTA-0002",
      numero: "SETP990033341",
      cufe: "fc3808945f893d56a297a7e1898701886134b22c836932c02f022731fa19348e7182142270fa3fb9d35d2d0",
      is_validated: true,
      public_url: "https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=fc3808945f893d56a297a7e1898701886134b22c836932c02f022731fa19348e7182142270fa3fb9d35d2d0",
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

export const listaVentas: VentaDetalle[] = [ventaDigital, ventaFiado];

let consecutivoVentas = 3;

/**
 * Devuelve datos falsos para (método, ruta) cuando NEXT_PUBLIC_USE_MOCKS=true.
 * Devuelve undefined si no hay mock para esa ruta o si los mocks están apagados.
 */
export function getMock(method: string, path: string, body?: unknown): unknown | undefined {
  if (!USE_MOCKS) return undefined;
  const url = new URL(path, "http://localhost");
  const ruta = url.pathname;
  const m = method.toUpperCase();

  if (m === "POST" && ruta === "/api/auth/login") return { token: "mock-token" };
  if (m === "GET" && ruta === "/api/health") return { status: "ok", factus_mode: "fake" };

  // --- PRODUCTOS ---
  if (m === "GET" && ruta === "/api/productos") {
    let res = [...productos.filter((x) => x.activo)];
    const q = url.searchParams.get("q")?.toLowerCase();
    const bajoStock = url.searchParams.get("bajo_stock") === "true";
    if (bajoStock) {
      res = res.filter((x) => x.stock <= x.stock_minimo);
    }
    if (q) {
      res = res.filter(
        (x) => x.nombre.toLowerCase().includes(q) || (x.codigo && x.codigo.toLowerCase().includes(q)),
      );
    }
    return res;
  }

  if (m === "POST" && ruta === "/api/productos") {
    const data = body as ProductoCreate;
    const nuevo: Producto = {
      id: productos.length + 1,
      nombre: data.nombre,
      precio: data.precio,
      iva: data.iva,
      stock: data.stock,
      stock_minimo: data.stock_minimo,
      codigo: data.codigo || null,
      activo: true,
    };
    productos.unshift(nuevo);
    return nuevo;
  }

  const matchPutProducto = ruta.match(/^\/api\/productos\/(\d+)$/);
  if (m === "PUT" && matchPutProducto) {
    const id = parseInt(matchPutProducto[1], 10);
    const index = productos.findIndex((x) => x.id === id);
    if (index !== -1) {
      const data = body as ProductoUpdate;
      productos[index] = { ...productos[index], ...data };
      return productos[index];
    }
  }

  const matchEntrada = ruta.match(/^\/api\/productos\/(\d+)\/entrada$/);
  if (m === "POST" && matchEntrada) {
    const id = parseInt(matchEntrada[1], 10);
    const index = productos.findIndex((x) => x.id === id);
    if (index !== -1) {
      const data = body as EntradaInventario;
      productos[index].stock += data.cantidad;
      return productos[index];
    }
  }

  // --- CLIENTES ---
  if (m === "GET" && ruta === "/api/clientes") {
    const q = url.searchParams.get("q")?.toLowerCase();
    if (q) {
      return clientes.filter(
        (c) => c.nombres.toLowerCase().includes(q) || c.documento.includes(q),
      );
    }
    return clientes;
  }

  if (m === "POST" && ruta === "/api/clientes") {
    const data = body as ClienteCreate;
    const nuevo: Cliente = {
      id: clientes.length + 1,
      tipo_documento: data.tipo_documento,
      documento: data.documento,
      nombres: data.nombres,
      telefono: data.telefono || null,
      email: data.email || null,
      direccion: data.direccion || null,
    };
    clientes.push(nuevo);
    return nuevo;
  }

  // Cartera dinámica por cliente
  const matchCartera = ruta.match(/^\/api\/clientes\/(\d+)\/cartera$/);
  if (m === "GET" && matchCartera) {
    const cid = parseInt(matchCartera[1], 10);
    const cli = clientes.find((c) => c.id === cid) || clientes[0];
    const ventasFiadas = listaVentas.filter(
      (v) => v.cliente_id === cli.id && (v.estado === "fiado_abierto" || v.saldo > 0),
    );
    const saldoTotal = ventasFiadas.reduce((acc, v) => acc + v.saldo, 0);

    return {
      cliente: cli,
      saldo_total: saldoTotal,
      ventas: ventasFiadas.map((v) => ({
        venta_id: v.id,
        reference_code: v.reference_code,
        total: v.total,
        abonado: v.total - v.saldo,
        saldo: v.saldo,
        due_date: v.due_date,
      })),
    };
  }

  // --- VENTAS ---
  if (m === "GET" && ruta === "/api/ventas") {
    const estadoFiltro = url.searchParams.get("estado");
    if (estadoFiltro) {
      return listaVentas.filter((v) => v.estado === estadoFiltro).map(resumenDe);
    }
    return listaVentas.map(resumenDe);
  }

  if (m === "GET" && ruta === "/api/reportes/resumen") {
    const fiadosAbiertos = listaVentas.filter((v) => v.estado === "fiado_abierto");
    const fiadoPendiente = fiadosAbiertos.reduce((acc, v) => acc + v.saldo, 0);

    return {
      ventas_hoy: listaVentas.length,
      total_hoy: listaVentas.reduce((acc, v) => acc + (v.estado === "pagada" ? v.total : 0), 0),
      fiado_pendiente: fiadoPendiente,
      productos_bajo_stock: productos.filter((x) => x.stock <= x.stock_minimo),
    };
  }

  const matchVentaDetalle = ruta.match(/^\/api\/ventas\/(\d+)$/);
  if (m === "GET" && matchVentaDetalle) {
    const id = parseInt(matchVentaDetalle[1], 10);
    const encontrada = listaVentas.find((v) => v.id === id);
    if (encontrada) return encontrada;
    return ventaDigital;
  }

  if (m === "POST" && ruta === "/api/ventas") {
    const data = body as VentaCreate;
    const id = consecutivoVentas++;
    const ref = `TFXX-VENTA-${String(id).padStart(4, "0")}`;

    // Construir items
    const itemsComprados: VentaItem[] = [];
    let subtotalSinIva = 0;
    let totalConIva = 0;

    data.items.forEach((item, idx) => {
      const prod = productos.find((p) => p.id === item.producto_id);
      if (prod) {
        if (data.tipo_pago !== "digital") {
          prod.stock -= item.cantidad; // En digital descuenta al pagarse; en efectivo y fiado descuenta de inmediato
        }
        const valorTotalLinea = Math.round(prod.precio * (1 + prod.iva / 100) * item.cantidad);
        subtotalSinIva += prod.precio * item.cantidad;
        totalConIva += valorTotalLinea;
        itemsComprados.push({
          id: idx + 1,
          producto_id: prod.id,
          nombre: prod.nombre,
          cantidad: item.cantidad,
          precio: prod.precio,
          iva: prod.iva,
        });
      }
    });

    const clienteEncontrado = data.cliente_id
      ? clientes.find((c) => c.id === data.cliente_id) ?? null
      : null;

    const documentos: DocumentoElectronico[] = [];
    if (data.facturar || data.tipo_pago === "fiado") {
      documentos.push({
        id,
        tipo: "factura",
        reference_code: ref,
        numero: `SETP990033${String(340 + id)}`,
        cufe: `fc3808945f893d56a297a7e1898701886134b22c836932c02f022731fa19348e7182142270fa3fb9d35d2d0`,
        is_validated: true,
        public_url: `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=fc3808945f893d56a297a7e1898701886134b22c836932c02f022731fa19348e7182142270fa3fb9d35d2d0`,
        factura_origen_id: null,
        errores: null,
      });
    }

    if (data.tipo_pago === "efectivo") {
      const nuevaVenta: VentaDetalle = {
        id,
        reference_code: ref,
        tipo_pago: "efectivo",
        estado: "pagada",
        total: totalConIva,
        cliente_id: data.cliente_id ?? null,
        due_date: null,
        created_at: new Date().toISOString(),
        saldo: 0,
        cliente: clienteEncontrado,
        items: itemsComprados,
        recaudos: [],
        documentos,
      };
      listaVentas.unshift(nuevaVenta);
      return nuevaVenta;
    }

    if (data.tipo_pago === "fiado") {
      const nuevaVentaFiado: VentaDetalle = {
        id,
        reference_code: ref,
        tipo_pago: "fiado",
        estado: "fiado_abierto",
        total: totalConIva,
        cliente_id: data.cliente_id ?? (clienteEncontrado ? clienteEncontrado.id : 1),
        due_date: data.due_date ?? "2026-12-15",
        created_at: new Date().toISOString(),
        saldo: totalConIva,
        cliente: clienteEncontrado ?? clientes[0],
        items: itemsComprados,
        recaudos: [],
        documentos,
      };
      listaVentas.unshift(nuevaVentaFiado);
      return nuevaVentaFiado;
    }

    // Digital con Factus Pay
    const nuevaVentaDigital: VentaDetalle = {
      id,
      reference_code: ref,
      tipo_pago: "digital",
      estado: "esperando_pago",
      total: totalConIva,
      cliente_id: data.cliente_id ?? null,
      due_date: null,
      created_at: new Date().toISOString(),
      saldo: totalConIva,
      cliente: clienteEncontrado,
      items: itemsComprados,
      recaudos: [
        {
          id: id * 10,
          reference_code: ref,
          tipo: "venta",
          monto: totalConIva,
          estado: "ready",
          breb_key: `@FC8UL6IPPXOA9QB6X48P`,
          qr: FAKE_QR_BASE64,
          qr_expires_at: new Date(Date.now() + 86400000).toISOString(),
          collected_at: null,
        },
      ],
      documentos: [],
    };
    listaVentas.unshift(nuevaVentaDigital);
    return nuevaVentaDigital;
  }

  // --- ABONOS A FIADOS ---
  const matchAbono = ruta.match(/^\/api\/ventas\/(\d+)\/abonos$/);
  if (m === "POST" && matchAbono) {
    const vid = parseInt(matchAbono[1], 10);
    const data = body as AbonoIn;
    const v = listaVentas.find((x) => x.id === vid) || ventaFiado;
    const abonoIndex = v.recaudos.filter((r) => r.tipo === "abono").length + 1;
    const refAbono = `${v.reference_code}-AB${abonoIndex}`;

    const nuevoRecaudo: Recaudo = {
      id: Date.now(),
      reference_code: refAbono,
      tipo: "abono",
      monto: data.monto,
      estado: "ready",
      breb_key: `@FC8UL6IPPXOA9QB6X48P`,
      qr: FAKE_QR_BASE64,
      qr_expires_at: new Date(Date.now() + 86400000).toISOString(),
      collected_at: null,
    };
    v.recaudos.push(nuevoRecaudo);
    return v;
  }

  // --- NOTA CRÉDITO ---
  const matchNC = ruta.match(/^\/api\/ventas\/(\d+)\/nota-credito$/);
  if (m === "POST" && matchNC) {
    const vid = parseInt(matchNC[1], 10);
    const data = body as NotaCreditoIn;
    const v = listaVentas.find((x) => x.id === vid) || ventaDigital;
    const numNC = v.documentos.filter((d) => d.tipo === "nota_credito").length + 1;
    const refNC = `${v.reference_code}-NC${numNC}`;

    if (data.concepto === 2) {
      // Anulación total
      v.estado = "anulada";
      v.saldo = 0;
      v.items.forEach((it) => {
        const pr = productos.find((prod) => prod.id === it.producto_id);
        if (pr) pr.stock += it.cantidad;
      });
      // Si fue digital pagada, devolver_manual es el total
      if (v.tipo_pago === "digital") {
        v.devolver_manual = v.total;
      }
    } else if (data.concepto === 1 && data.items) {
      // Devolución parcial de items
      let montoDevuelto = 0;
      data.items.forEach((it) => {
        const pr = productos.find((prod) => prod.id === it.producto_id);
        if (pr) pr.stock += it.cantidad;
        const vi = v.items.find((item) => item.producto_id === it.producto_id);
        if (vi) {
          const valorConIva = Math.round(vi.precio * (1 + vi.iva / 100) * it.cantidad);
          montoDevuelto += valorConIva;
          vi.cantidad = Math.max(0, vi.cantidad - it.cantidad);
        }
      });
      if (v.tipo_pago === "digital") {
        v.devolver_manual = (v.devolver_manual || 0) + montoDevuelto;
      } else if (v.tipo_pago === "fiado") {
        v.saldo = Math.max(0, v.saldo - montoDevuelto);
        if (v.saldo === 0) v.estado = "fiado_pagado";
      }
    }

    v.documentos.push({
      id: Date.now(),
      tipo: "nota_credito",
      reference_code: refNC,
      numero: `CRTE${1300 + numNC}`,
      cufe: `cude-${refNC.toLowerCase()}`,
      is_validated: true,
      public_url: `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=cude-${refNC.toLowerCase()}`,
      factura_origen_id: v.id,
      errores: null,
    });
    return v;
  }

  // --- NOTA DÉBITO ---
  const matchND = ruta.match(/^\/api\/ventas\/(\d+)\/nota-debito$/);
  if (m === "POST" && matchND) {
    const vid = parseInt(matchND[1], 10);
    const data = body as NotaDebitoIn;
    const v = listaVentas.find((x) => x.id === vid) || ventaDigital;
    const numND = v.documentos.filter((d) => d.tipo === "nota_debito").length + 1;
    const refND = `${v.reference_code}-ND${numND}`;

    let totalAgregado = 0;
    data.items.forEach((it) => {
      const pr = productos.find((prod) => prod.id === it.producto_id);
      if (pr) {
        pr.stock -= it.cantidad;
        const valorConIva = Math.round(pr.precio * (1 + pr.iva / 100) * it.cantidad);
        totalAgregado += valorConIva;
        v.items.push({
          id: v.items.length + 1,
          producto_id: pr.id,
          nombre: `${pr.nombre} (Agregado)`,
          cantidad: it.cantidad,
          precio: pr.precio,
          iva: pr.iva,
        });
      }
    });

    v.total += totalAgregado;
    if (v.tipo_pago === "fiado") {
      v.saldo += totalAgregado;
      if (v.estado === "fiado_pagado") v.estado = "fiado_abierto";
    } else if (v.tipo_pago === "digital") {
      v.recaudos.push({
        id: Date.now(),
        reference_code: `${v.reference_code}-ND${numND}`,
        tipo: "diferencia",
        monto: totalAgregado,
        estado: "ready",
        breb_key: `@FC8UL6IPPXOA9QB6X48P`,
        qr: FAKE_QR_BASE64,
        qr_expires_at: new Date(Date.now() + 86400000).toISOString(),
        collected_at: null,
      });
    }

    v.documentos.push({
      id: Date.now(),
      tipo: "nota_debito",
      reference_code: refND,
      numero: `ND${460 + numND}`,
      cufe: `cude-${refND.toLowerCase()}`,
      is_validated: true,
      public_url: `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=cude-${refND.toLowerCase()}`,
      factura_origen_id: v.id,
      errores: null,
    });
    return v;
  }

  // --- INTERPRETAR VOZ ---
  if (m === "POST" && ruta === "/api/voz/interpretar") {
    const { texto } = (body as { texto: string }) || { texto: "" };
    const t = (texto || "").toLowerCase();

    const itemsDetectados: VozItem[] = [];
    const noReconocidos: string[] = [];

    // Detectar cantidades y palabras clave de productos
    productos.forEach((prod) => {
      const nombreMin = prod.nombre.toLowerCase();
      const palabras = nombreMin.split(" ");
      const keyword = palabras[0]; // ej "arroz", "leche", "huevos", "aceite"

      if (t.includes(keyword)) {
        let cant = 1;
        const regex = new RegExp(`(\\d+|un|una|uno|dos|tres|cuatro|cinco)\\s+${keyword}`, "i");
        const match = t.match(regex);
        if (match) {
          const numStr = match[1].toLowerCase();
          if (numStr === "un" || numStr === "una" || numStr === "uno") cant = 1;
          else if (numStr === "dos") cant = 2;
          else if (numStr === "tres") cant = 3;
          else if (numStr === "cuatro") cant = 4;
          else if (numStr === "cinco") cant = 5;
          else if (!isNaN(parseInt(numStr, 10))) cant = parseInt(numStr, 10);
        }
        itemsDetectados.push({
          producto_id: prod.id,
          nombre: prod.nombre,
          cantidad: cant,
          confianza: 0.95,
        });
      }
    });

    // Detectar cliente
    let clienteDetectado: { id: number; nombres: string } | null = null;
    clientes.forEach((cli) => {
      const nombreSimple = cli.nombres.split(" ")[0].toLowerCase();
      if (t.includes(nombreSimple)) {
        clienteDetectado = { id: cli.id, nombres: cli.nombres };
      }
    });

    // Detectar tipo de pago
    let tipoPagoDetectado: TipoPago | null = null;
    if (t.includes("efectivo") || t.includes("plata") || t.includes("billete")) {
      tipoPagoDetectado = "efectivo";
    } else if (
      t.includes("qr") ||
      t.includes("bre-b") ||
      t.includes("digital") ||
      t.includes("transferencia") ||
      t.includes("nequi") ||
      t.includes("daviplata")
    ) {
      tipoPagoDetectado = "digital";
    } else if (
      t.includes("fiado") ||
      t.includes("fiar") ||
      t.includes("cuenta") ||
      t.includes("anótelo") ||
      t.includes("anotelo") ||
      t.includes("apúntelo")
    ) {
      tipoPagoDetectado = "fiado";
    }

    if (itemsDetectados.length === 0) {
      itemsDetectados.push({
        producto_id: 1,
        nombre: "Arroz Diana 500 g",
        cantidad: 2,
        confianza: 0.92,
      });
    }

    const resultado: VozResultado = {
      items: itemsDetectados,
      cliente: clienteDetectado,
      tipo_pago: tipoPagoDetectado,
      no_reconocidos: noReconocidos,
    };
    return resultado;
  }

  // Refrescar pago
  const matchRefrescar = ruta.match(/^\/api\/ventas\/(\d+)\/refrescar-pago$/);
  if (m === "POST" && matchRefrescar) {
    const id = parseInt(matchRefrescar[1], 10);
    const v = listaVentas.find((x) => x.id === id) || ventaDigital;

    // Buscar el recaudo pendiente
    const recaudoPendiente = v.recaudos.find((r) => r.estado === "ready");
    if (recaudoPendiente) {
      recaudoPendiente.estado = "paid";
      recaudoPendiente.collected_at = new Date().toISOString();

      if (recaudoPendiente.tipo === "abono") {
        v.saldo = Math.max(0, v.saldo - recaudoPendiente.monto);
        if (v.saldo === 0) {
          v.estado = "fiado_pagado";
        }
      } else {
        v.estado = "pagada";
        v.saldo = 0;
        // Descontar stock
        v.items.forEach((it) => {
          const pr = productos.find((p) => p.id === it.producto_id);
          if (pr) pr.stock -= it.cantidad;
        });
      }
    } else {
      v.estado = "pagada";
      v.saldo = 0;
    }

    // Emitir factura electrónica automática por transferencia (código 47) si no tenía
    if (v.documentos.length === 0) {
      v.documentos.push({
        id: v.id * 10,
        tipo: "factura",
        reference_code: v.reference_code,
        numero: `SETP990033${String(340 + v.id)}`,
        cufe: `fc3808945f893d56a297a7e1898701886134b22c836932c02f022731fa19348e7182142270fa3fb9d35d2d0`,
        is_validated: true,
        public_url: `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=fc3808945f893d56a297a7e1898701886134b22c836932c02f022731fa19348e7182142270fa3fb9d35d2d0`,
        factura_origen_id: null,
        errores: null,
      });
    }
    return v;
  }

  // Simular pago dev
  const matchSimular = ruta.match(/^\/api\/dev\/simular-pago\/(.+)$/);
  if (m === "POST" && matchSimular) {
    const ref = matchSimular[1];
    const v = listaVentas.find((x) =>
      x.reference_code === ref || x.recaudos.some((r) => r.reference_code === ref),
    );
    if (v) {
      const r = v.recaudos.find((rec) => rec.reference_code === ref) || v.recaudos[0];
      if (r) {
        r.estado = "paid";
        r.collected_at = new Date().toISOString();
        if (r.tipo === "abono") {
          v.saldo = Math.max(0, v.saldo - r.monto);
          if (v.saldo === 0) v.estado = "fiado_pagado";
        } else {
          v.estado = "pagada";
          v.saldo = 0;
        }
      }
    }
    return { ok: true };
  }

  return undefined;
}
