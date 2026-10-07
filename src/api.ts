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
      Authorization: `Bearer ${leerToken()}`,
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
  return `${protocolo}//${location.host}/api/en-vivo?token=${encodeURIComponent(leerToken())}`;
}
