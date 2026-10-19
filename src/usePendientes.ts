import { useCallback, useEffect, useRef, useState } from "react";
import { ATIENDE_DANO, type GrupoDano, type MetricasDanos } from "../shared/danos";
import { api, NoAutorizado } from "./api";
import { useEnVivo } from "./useEnVivo";

// Casos sin resolver, como los mensajes sin leer de WhatsApp: cada pestaña del menú muestra los suyos, y el
// total sale en el título y el ícono de la pestaña y, con el panel instalado como app, en su ícono de la
// barra de tareas (Windows y Mac).
// - Reportes, solo TI: lo mismo que "Reportes abiertos" del dashboard (abiertos, en atención y escalados).
// - Daños: pendientes y en proceso del grupo que atiende cada uno (TI, equipos tecnológicos; COA, el local).
// - Cuentas, solo TI: pedidos de cuenta o plataforma que los docentes enviaron desde /docente.
export interface Pendientes {
  reportes: number;
  danos: number;
  cuentas: number;
}

const NINGUNO: Pendientes = { reportes: 0, danos: 0, cuentas: 0 };

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

// rol: null antes de iniciar sesión
export function usePendientes(rol: string | null, onNoAutorizado: () => void): Pendientes {
  const [pendientes, setPendientes] = useState(NINGUNO);
  const espera = useRef<number>(undefined);
  const activo = rol !== null;

  const contar = useCallback(() => {
    if (!rol) return;
    const grupo = (Object.keys(ATIENDE_DANO) as GrupoDano[]).find((g) => ATIENDE_DANO[g] === rol);
    Promise.all([
      rol === "ti" ? api<unknown[]>("/api/reportes?estado=abiertos").then((r) => r.length) : 0,
      grupo ? api<MetricasDanos>(`/api/danos/metricas?dias=1&grupo=${grupo}`).then((m) => m.pendientes + m.en_proceso) : 0,
      rol === "ti" ? api<{ pendientes: number }>("/api/cuentas/pedidos").then((r) => r.pendientes) : 0,
    ])
      .then(([reportes, danos, cuentas]) => setPendientes({ reportes, danos, cuentas }))
      .catch((e) => {
        if (e instanceof NoAutorizado) onNoAutorizado();
      });
  }, [rol, onNoAutorizado]);

  useEffect(contar, [contar]);

  // Varios cambios seguidos (atender y resolver, por ejemplo) se cuentan una sola vez
  useEnVivo(() => {
    clearTimeout(espera.current);
    espera.current = window.setTimeout(contar, 400);
  }, activo);

  const total = activo ? pendientes.reportes + pendientes.danos + pendientes.cuentas : 0;
  useEffect(() => {
    mostrar(total);
  }, [total]);

  useEffect(() => () => {
    clearTimeout(espera.current);
    mostrar(0);
  }, []);

  return activo ? pendientes : NINGUNO;
}
