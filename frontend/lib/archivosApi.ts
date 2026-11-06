// Cliente de las rutas protegidas de API Gateway (JWT de Cognito):
//   POST /api/subir     -> devuelve una URL prefirmada de S3 (PUT, 300 s)
//   GET  /api/archivos  -> lista los archivos del usuario con URL prefirmada de descarga
// Los archivos viajan directo entre el navegador y el bucket S3 privado; el JWT solo
// autoriza a pedir la URL prefirmada.

import { FILES_API_URL, obtenerAccessToken } from "./cognito";

export const TIPOS_PERMITIDOS = ["application/pdf", "image/png", "image/jpeg", "text/plain"];
export const TAMANO_MAXIMO = 10 * 1024 * 1024; // 10 MB (el mismo límite de la Lambda)

export interface ArchivoRemoto {
  key: string;
  tamano: number;
  url: string;
}

export class SesionVencidaError extends Error {
  constructor() {
    super("Tu sesión venció. Inicia sesión de nuevo.");
  }
}

async function llamar<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await obtenerAccessToken();
  if (!token) throw new SesionVencidaError();

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${FILES_API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) throw new SesionVencidaError();
  if (!res.ok) {
    let detalle = `Error ${res.status}`;
    try {
      const data = await res.json();
      if (typeof data.error === "string") detalle = data.error;
    } catch {
      // la respuesta no era JSON
    }
    throw new Error(detalle);
  }
  return (await res.json()) as T;
}

export async function listarArchivos(): Promise<ArchivoRemoto[]> {
  const r = await llamar<{ archivos: ArchivoRemoto[] }>("GET", "/api/archivos");
  return r.archivos;
}

export async function subirArchivo(archivo: File): Promise<void> {
  if (!TIPOS_PERMITIDOS.includes(archivo.type)) {
    throw new Error("Solo se permiten PDF, PNG, JPG o TXT.");
  }
  if (archivo.size <= 0 || archivo.size > TAMANO_MAXIMO) {
    throw new Error("El archivo debe pesar entre 1 byte y 10 MB.");
  }

  const { url } = await llamar<{ url: string; key: string; expira_en: number }>(
    "POST",
    "/api/subir",
    { nombre: archivo.name, tipo: archivo.type, tamano: archivo.size },
  );

  // La URL prefirmada incluye el Content-Type: debe enviarse el mismo.
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": archivo.type },
    body: archivo,
  });
  if (!res.ok) throw new Error("No se pudo subir el archivo a S3.");
}
