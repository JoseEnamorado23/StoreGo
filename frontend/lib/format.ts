/**
 * Formato de dinero para Colombia: sin decimales y con símbolo de pesos.
 * Ejemplo: 15400 -> "$ 15.400"
 */
export function formatoCOP(valor: number): string {
  if (Number.isNaN(valor)) return "$ 0";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(valor);
}

/**
 * Formatea fechas ISO a formato legible en Colombia.
 * Ejemplo: "2026-11-04T12:00:00" -> "4 nov 2026, 12:00 p. m."
 */
export function formatoFecha(fechaIso: string | null | undefined): string {
  if (!fechaIso) return "—";
  try {
    const fecha = new Date(fechaIso);
    return new Intl.DateTimeFormat("es-CO", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(fecha);
  } catch {
    return fechaIso;
  }
}

/**
 * Formatea fechas cortas (solo día/mes/año).
 */
export function formatoFechaCorta(fechaIso: string | null | undefined): string {
  if (!fechaIso) return "—";
  try {
    const fecha = new Date(fechaIso.includes("T") ? fechaIso : `${fechaIso}T12:00:00`);
    return new Intl.DateTimeFormat("es-CO", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(fecha);
  } catch {
    return fechaIso;
  }
}
