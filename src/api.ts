import type { Sesion } from "../shared/tipos";

const CLAVE = "token_ti";

export function leerToken(): string {
  try {
    return localStorage.getItem(CLAVE) ?? "";
  } catch {
    return "";
  }
}

export function guardarToken(token: string) {
  try {
    if (token) localStorage.setItem(CLAVE, token);
    else localStorage.removeItem(CLAVE);
  } catch {
    // almacenamiento no disponible: el token solo dura esta sesión
  }
}

export class NoAutorizado extends Error {}

export async function api<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const res = await fetch(ruta, {
    ...opciones,
    headers: {
      "Content-Type": "application/json",
      // Con Cloudflare Access la sesión viaja en una cookie; la clave solo se usa en local
      ...(leerToken() ? { Authorization: `Bearer ${leerToken()}` } : {}),
      ...opciones.headers,
    },
  });
  if (res.status === 401) throw new NoAutorizado();
  const datos = await res.json();
  if (!res.ok) throw new Error((datos as { error?: string }).error ?? "Error");
  return datos as T;
}

export function urlEnVivo(): string {
  const protocolo = location.protocol === "https:" ? "wss:" : "ws:";
  const token = leerToken();
  return `${protocolo}//${location.host}/api/en-vivo${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}

export type EstadoSesion =
  | { tipo: "cargando" }
  | { tipo: "ok"; sesion: Sesion }
  | { tipo: "pedir-clave" } // desarrollo local sin Access
  | { tipo: "sin-acceso"; detalle: string };

export async function consultarSesion(): Promise<EstadoSesion> {
  const res = await fetch("/api/sesion", {
    headers: leerToken() ? { Authorization: `Bearer ${leerToken()}` } : {},
  });
  if (res.ok) {
    const sesion = (await res.json()) as Sesion;
    if (sesion.rol === "ti" || sesion.rol === "coa" || sesion.rol === "mantenimiento") return { tipo: "ok", sesion };
    return { tipo: "sin-acceso", detalle: `${sesion.email} no está en la lista de TI. Para reportar, escanea el QR del aula.` };
  }
  const { access } = (await res.json().catch(() => ({}))) as { access?: boolean };
  if (access) return { tipo: "sin-acceso", detalle: "Tu cuenta no tiene permiso para entrar al panel de TI." };
  return { tipo: "pedir-clave" };
}
