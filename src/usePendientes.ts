import { useCallback, useEffect, useRef, useState } from "react";
import { api, NoAutorizado } from "./api";
import { useEnVivo } from "./useEnVivo";

// Casos sin resolver, como los mensajes sin leer de WhatsApp: el número sale en el título y el ícono
// de la pestaña y, con el panel instalado como app, en su ícono de la barra de tareas (Windows y Mac).
// Cuenta lo mismo que "Reportes abiertos" del dashboard: abiertos, en atención y escalados.

const TITULO = document.title;
const ICONO = "/icono.svg";

// El ícono de la app con un círculo rojo y el número; arriba de 9 dice 9+, como en el celular
function iconoConNumero(n: number): string {
  const texto = n > 9 ? "9+" : String(n);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="16" fill="#2f5bea"/>
<path d="M13 32h9l6-17 8 34 6-17h9" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="41" cy="23" r="21" fill="#e0383e" stroke="#fff" stroke-width="3"/>
<text x="41" y="24" fill="#fff" font-family="system-ui,sans-serif" font-weight="800" font-size="${texto.length > 1 ? 25 : 32}" text-anchor="middle" dominant-baseline="central">${texto}</text>
</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function mostrar(n: number) {
  document.title = n > 0 ? `(${n}) ${TITULO}` : TITULO;
  const enlace = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (enlace) enlace.href = n > 0 ? iconoConNumero(n) : ICONO;
  try {
    if (n > 0) void navigator.setAppBadge?.(n).catch(() => {});
    else void navigator.clearAppBadge?.().catch(() => {});
  } catch {
    // el navegador no muestra números en el ícono de la app
  }
}

export function usePendientes(activo: boolean, onNoAutorizado: () => void): number {
  const [pendientes, setPendientes] = useState(0);
  const espera = useRef<number>(undefined);

  const contar = useCallback(() => {
    if (!activo) return;
    api<unknown[]>("/api/reportes?estado=abiertos")
      .then((r) => setPendientes(r.length))
      .catch((e) => {
        if (e instanceof NoAutorizado) onNoAutorizado();
      });
  }, [activo, onNoAutorizado]);

  useEffect(contar, [contar]);

  // Varios cambios seguidos (atender y resolver, por ejemplo) se cuentan una sola vez
  useEnVivo(() => {
    clearTimeout(espera.current);
    espera.current = window.setTimeout(contar, 400);
  }, activo);

  useEffect(() => {
    mostrar(activo ? pendientes : 0);
  }, [activo, pendientes]);

  useEffect(() => () => {
    clearTimeout(espera.current);
    mostrar(0);
  }, []);

  return activo ? pendientes : 0;
}
