"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Package,
  Plus,
  Search,
  AlertTriangle,
  Edit2,
  ArrowDownToLine,
  X,
  Check,
  Percent,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { formatoCOP } from "@/lib/format";
import { useAlerta } from "@/components/AlertaContext";
import type { Producto, ProductoCreate, ProductoUpdate } from "@/lib/types";

export default function PaginaInventario() {
  const { mostrarExito, mostrarError, ejecutarConCarga } = useAlerta();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [soloBajoStock, setSoloBajoStock] = useState(false);
  const [cargandoLista, setCargandoLista] = useState(true);

  // Modales
  const [modalProductoAbierto, setModalProductoAbierto] = useState(false);
  const [productoAEditar, setProductoAEditar] = useState<Producto | null>(null);

  const [modalEntradaAbierto, setModalEntradaAbierto] = useState(false);
  const [productoEntrada, setProductoEntrada] = useState<Producto | null>(null);
  const [cantidadEntrada, setCantidadEntrada] = useState<number>(10);
  const [notaEntrada, setNotaEntrada] = useState("");

  // Formulario producto
  const [formNombre, setFormNombre] = useState("");
  const [formCodigo, setFormCodigo] = useState("");
  const [formPrecio, setFormPrecio] = useState<number | "">("");
  const [formIva, setFormIva] = useState<0 | 19>(0);
  const [formStock, setFormStock] = useState<number | "">("");
  const [formStockMinimo, setFormStockMinimo] = useState<number | "">(5);
  const [formActivo, setFormActivo] = useState(true);

  // Cargar productos
  const cargarProductos = async () => {
    setCargandoLista(true);
    try {
      const res = await api.listarProductos({
        q: busqueda.trim() || undefined,
        bajo_stock: soloBajoStock ? true : undefined,
      });
      setProductos(res);
    } catch (err: unknown) {
      mostrarError(
        err instanceof Error ? err.message : "Error al cargar la lista de productos",
      );
    } finally {
      setCargandoLista(false);
    }
  };

  useEffect(() => {
    void cargarProductos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soloBajoStock]);

  const handleBuscar = (e: React.FormEvent) => {
    e.preventDefault();
    void cargarProductos();
  };

  // Abrir modal para crear
  const abrirCrear = () => {
    setProductoAEditar(null);
    setFormNombre("");
    setFormCodigo("");
    setFormPrecio("");
    setFormIva(0);
    setFormStock(0);
    setFormStockMinimo(5);
    setFormActivo(true);
    setModalProductoAbierto(true);
  };

  // Abrir modal para editar
  const abrirEditar = (prod: Producto) => {
    setProductoAEditar(prod);
    setFormNombre(prod.nombre);
    setFormCodigo(prod.codigo || "");
    setFormPrecio(prod.precio);
    setFormIva(prod.iva);
    setFormStock(prod.stock);
    setFormStockMinimo(prod.stock_minimo);
    setFormActivo(prod.activo);
    setModalProductoAbierto(true);
  };

  // Guardar (Crear o Editar)
  const guardarProducto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNombre.trim()) {
      mostrarError("El nombre del producto es obligatorio.");
      return;
    }
    if (formPrecio === "" || Number(formPrecio) < 0) {
      mostrarError("El precio debe ser un número positivo.");
      return;
    }

    const precioNum = Number(formPrecio);
    const stockNum = formStock === "" ? 0 : Number(formStock);
    const stockMinNum = formStockMinimo === "" ? 5 : Number(formStockMinimo);

    if (productoAEditar) {
      // Actualizar
      const payload: ProductoUpdate = {
        nombre: formNombre.trim(),
        codigo: formCodigo.trim() || undefined,
        precio: precioNum,
        iva: formIva,
        stock: stockNum,
        stock_minimo: stockMinNum,
        activo: formActivo,
      };

      const res = await ejecutarConCarga(async () => {
        return await api.actualizarProducto(productoAEditar.id, payload);
      }, "Guardando cambios...");

      if (res) {
        mostrarExito(`Producto "${res.nombre}" actualizado.`);
        setModalProductoAbierto(false);
        void cargarProductos();
      }
    } else {
      // Crear
      const payload: ProductoCreate = {
        nombre: formNombre.trim(),
        codigo: formCodigo.trim() || undefined,
        precio: precioNum,
        iva: formIva,
        stock: stockNum,
        stock_minimo: stockMinNum,
      };

      const res = await ejecutarConCarga(async () => {
        return await api.crearProducto(payload);
      }, "Creando producto...");

      if (res) {
        mostrarExito(`Producto "${res.nombre}" agregado con éxito.`);
        setModalProductoAbierto(false);
        void cargarProductos();
      }
    }
  };

  // Abrir entrada de mercancía
  const abrirEntrada = (prod: Producto) => {
    setProductoEntrada(prod);
    setCantidadEntrada(10);
    setNotaEntrada("");
    setModalEntradaAbierto(true);
  };

  // Guardar entrada
  const guardarEntrada = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productoEntrada) return;
    if (cantidadEntrada <= 0) {
      mostrarError("La cantidad debe ser mayor a 0.");
      return;
    }

    const res = await ejecutarConCarga(async () => {
      return await api.entradaProducto(productoEntrada.id, {
        cantidad: cantidadEntrada,
        nota: notaEntrada.trim() || undefined,
      });
    }, "Registrando entrada...");

    if (res) {
      mostrarExito(
        `Se sumaron ${cantidadEntrada} unidades a "${res.nombre}". Nuevo stock: ${res.stock}`,
      );
      setModalEntradaAbierto(false);
      void cargarProductos();
    }
  };

  return (
    <div className="space-y-5">
      {/* Encabezado y botón nuevo */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Inventario</h1>
          <p className="text-xs text-slate-500">Controla stock, precios y entradas de mercancía de tu tienda</p>
        </div>
        <button
          type="button"
          onClick={abrirCrear}
          className="self-start sm:self-auto flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 active:scale-95 transition-all hover:bg-emerald-700"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>+ Nuevo producto</span>
        </button>
      </div>

      {/* Buscador y filtro de bajo stock */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        <form onSubmit={handleBuscar} className="relative flex-1">
          <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o código..."
            className="w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-20 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 shadow-2xs"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1.5 bottom-1.5 rounded-xl bg-slate-900 px-3.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Buscar
          </button>
        </form>

        <button
          type="button"
          onClick={() => setSoloBajoStock(!soloBajoStock)}
          className={`shrink-0 flex items-center justify-center gap-1.5 rounded-2xl px-4 py-2.5 text-xs font-semibold transition-all border ${
            soloBajoStock
              ? "bg-rose-500 text-white border-rose-500 shadow-sm shadow-rose-500/20"
              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 shadow-2xs"
          }`}
        >
          <AlertTriangle className={`w-3.5 h-3.5 ${soloBajoStock ? "text-white" : "text-rose-500"}`} />
          <span>Solo stock bajo (≤ mínimo)</span>
        </button>
      </div>

      {/* Listado de productos */}
      {cargandoLista ? (
        <div className="py-16 text-center text-sm text-slate-500 bg-white rounded-2xl border border-slate-200">
          <Package className="w-8 h-8 text-slate-300 mx-auto mb-2 animate-bounce" />
          Cargando inventario...
        </div>
      ) : productos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="font-semibold text-slate-700 text-sm">No se encontraron productos</p>
          <p className="text-xs text-slate-400 mt-1">
            {soloBajoStock
              ? "¡Excelente! No tienes productos con inventario crítico."
              : "Prueba con otra búsqueda o agrega un nuevo producto."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {productos.map((prod) => {
            const esBajoStock = prod.stock <= prod.stock_minimo;
            const precioTotalConIva = prod.precio * (1 + prod.iva / 100);

            return (
              <div
                key={prod.id}
                className={`rounded-2xl bg-white p-4 shadow-sm border transition-all ${
                  esBajoStock
                    ? "border-rose-300 bg-rose-50/20"
                    : "border-slate-200/90"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 text-base leading-snug truncate">
                        {prod.nombre}
                      </h3>
                      {prod.codigo && (
                        <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-600">
                          {prod.codigo}
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-base font-black text-emerald-700">
                        {formatoCOP(precioTotalConIva)}
                      </span>
                      <span className="text-xs text-slate-400">
                        (base: {formatoCOP(prod.precio)} {prod.iva > 0 ? `+ IVA ${prod.iva}%` : "IVA 0%"})
                      </span>
                    </div>
                  </div>

                  {/* Badge de stock: EN ROJO cuando es menor o igual al mínimo */}
                  <div
                    className={`shrink-0 flex flex-col items-end rounded-xl px-2.5 py-1.5 border text-right ${
                      esBajoStock
                        ? "bg-rose-100/90 border-rose-300 text-rose-900 font-extrabold animate-pulse"
                        : "bg-emerald-50 border-emerald-200 text-emerald-900 font-bold"
                    }`}
                  >
                    <span className="text-xs leading-none">Stock: {prod.stock}</span>
                    <span className="text-[10px] font-medium opacity-80 mt-0.5">
                      Mín: {prod.stock_minimo}
                    </span>
                    {esBajoStock && (
                      <span className="text-[9px] font-black uppercase text-rose-700 mt-0.5 tracking-wider">
                        ¡Agotándose!
                      </span>
                    )}
                  </div>
                </div>

                {/* Botones de acción grandes y accesibles */}
                <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => abrirEntrada(prod)}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 py-2.5 px-3 text-xs font-bold text-white active:scale-95 transition-all hover:bg-slate-800 min-h-[42px]"
                  >
                    <ArrowDownToLine className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Entrada de mercancía</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => abrirEditar(prod)}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 px-3.5 text-xs font-bold text-slate-700 active:scale-95 transition-all hover:bg-slate-50 min-h-[42px]"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                    <span>Editar</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: Crear o Editar Producto */}
      {modalProductoAbierto && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h2 className="text-lg font-black text-slate-900">
                {productoAEditar ? "Editar producto" : "Nuevo producto"}
              </h2>
              <button
                type="button"
                onClick={() => setModalProductoAbierto(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={guardarProducto} className="space-y-4">
              <div>
                <label htmlFor="producto-nombre" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Nombre del producto *
                </label>
                <input id="producto-nombre"
                  type="text"
                  required
                  value={formNombre}
                  onChange={(e) => setFormNombre(e.target.value)}
                  placeholder="Ej. Arroz Diana 500 g"
                  className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                />
              </div>

              <div>
                <label htmlFor="producto-codigo" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Código de barras o referencia (opcional)
                </label>
                <input id="producto-codigo"
                  type="text"
                  value={formCodigo}
                  onChange={(e) => setFormCodigo(e.target.value)}
                  placeholder="Ej. ARR-01"
                  className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="producto-precio" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Precio base sin IVA ($) *
                  </label>
                  <input id="producto-precio"
                    type="number"
                    required
                    min="0"
                    step="50"
                    value={formPrecio}
                    onChange={(e) =>
                      setFormPrecio(e.target.value === "" ? "" : Number(e.target.value))
                    }
                    placeholder="2400"
                    className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 font-bold text-slate-900"
                  />
                </div>

                <div>
                  <span id="etiqueta-iva" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Tarifa de IVA *
                  </span>
                  <div role="group" aria-labelledby="etiqueta-iva" className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFormIva(0)}
                      className={`py-3 text-xs font-bold rounded-xl border transition-all ${
                        formIva === 0
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      0% (Exento)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormIva(19)}
                      className={`py-3 text-xs font-bold rounded-xl border transition-all ${
                        formIva === 19
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      19%
                    </button>
                  </div>
                </div>
              </div>

              {formPrecio !== "" && (
                <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 flex items-center justify-between border border-slate-200">
                  <span>Precio final al público con IVA:</span>
                  <span className="text-sm font-black text-emerald-700">
                    {formatoCOP(Number(formPrecio) * (1 + formIva / 100))}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="producto-stock" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Stock inicial
                  </label>
                  <input id="producto-stock"
                    type="number"
                    min="0"
                    value={formStock}
                    onChange={(e) =>
                      setFormStock(e.target.value === "" ? "" : Number(e.target.value))
                    }
                    placeholder="0"
                    className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                  />
                </div>

                <div>
                  <label htmlFor="producto-stock-minimo" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Stock mínimo alerta
                  </label>
                  <input id="producto-stock-minimo"
                    type="number"
                    min="1"
                    value={formStockMinimo}
                    onChange={(e) =>
                      setFormStockMinimo(e.target.value === "" ? "" : Number(e.target.value))
                    }
                    placeholder="5"
                    className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                  />
                </div>
              </div>

              {productoAEditar && (
                <div className="flex items-center gap-3 pt-2">
                  <input
                    type="checkbox"
                    id="formActivo"
                    checked={formActivo}
                    onChange={(e) => setFormActivo(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <label htmlFor="formActivo" className="text-xs font-semibold text-slate-700">
                    Producto activo en ventas
                  </label>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full rounded-2xl bg-emerald-600 py-3.5 text-base font-bold text-white shadow-md shadow-emerald-600/20 active:scale-95 transition-all hover:bg-emerald-700 min-h-[50px]"
                >
                  {productoAEditar ? "Guardar cambios" : "Crear producto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Entrada de Mercancía */}
      {modalEntradaAbierto && productoEntrada && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h2 className="text-lg font-black text-slate-900">Entrada de mercancía</h2>
                <p className="text-xs font-semibold text-emerald-700 mt-0.5">
                  {productoEntrada.nombre}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalEntradaAbierto(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={guardarEntrada} className="space-y-4">
              <div className="rounded-2xl bg-slate-50 p-3.5 border border-slate-200 flex items-center justify-between text-xs">
                <span className="text-slate-600">Stock actual en tienda:</span>
                <span className="font-bold text-slate-900 text-sm">
                  {productoEntrada.stock} unidades
                </span>
              </div>

              <div>
                <label htmlFor="producto-entrada-cantidad" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Cantidad que entra *
                </label>
                <input id="producto-entrada-cantidad"
                  type="number"
                  required
                  min="1"
                  value={cantidadEntrada}
                  onChange={(e) => setCantidadEntrada(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 p-3 text-lg font-black text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 text-center"
                />

                {/* Botones de incremento rápido para el tendero */}
                <div className="flex gap-2 mt-2">
                  {[5, 10, 24, 50].map((inc) => (
                    <button
                      key={inc}
                      type="button"
                      onClick={() => setCantidadEntrada((prev) => prev + inc)}
                      className="flex-1 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 active:bg-slate-100"
                    >
                      +{inc}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="producto-entrada-nota" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Nota o proveedor (opcional)
                </label>
                <input id="producto-entrada-nota"
                  type="text"
                  value={notaEntrada}
                  onChange={(e) => setNotaEntrada(e.target.value)}
                  placeholder="Ej. Factura proveedor Alquería #402"
                  className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                />
              </div>

              <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800 font-medium">
                Nuevo stock resultante:{" "}
                <strong className="text-sm font-black text-emerald-900">
                  {productoEntrada.stock + (cantidadEntrada > 0 ? cantidadEntrada : 0)} unidades
                </strong>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full rounded-2xl bg-slate-900 py-3.5 text-base font-bold text-white shadow-md active:scale-95 transition-all hover:bg-slate-800 min-h-[50px]"
                >
                  Sumar al inventario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
