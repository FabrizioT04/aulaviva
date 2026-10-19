// Monitoreo de los laboratorios ML (las aulas con Chromebooks): TI se queda en el aula viendo que nadie
// juegue ni maltrate los equipos. Cada ronda guarda el aula, desde y hasta qué hora, y lo que encontró.
// Solo lo ve y lo registra quien está en MONITOREO_EMAILS (ver worker/monitoreo.ts).

export const HALLAZGOS = {
  juegos: "Juegos o páginas no permitidas",
  mal_uso: "Chromebook maltratada o mal usada",
  sin_carga: "Chromebooks sin carga",
  fuera_de_lugar: "Chromebook fuera de su lugar o faltante",
  otro: "Otro",
} as const;

export type Hallazgo = keyof typeof HALLAZGOS;

export interface Monitoreo {
  id: number;
  aula_id: number;
  piso: number | null;
  aulas: string; // las aulas del laboratorio de ese piso: "306 y 307"
  email: string; // quién hizo la ronda
  inicio: string;
  fin: string | null;
  hallazgos: Hallazgo[]; // vacío = todo en orden
  nota: string | null;
  fotos: number;
}

// Cada piso tiene un solo laboratorio ML, aunque ocupe dos aulas (306 y 307 son uno solo)
export interface Laboratorio {
  aula_id: number; // la primera aula del piso: con ella se guarda la ronda
  piso: number | null;
  aulas: string; // "306 y 307"
}

// 2 → "2do piso", 3 → "3er piso"
export function nombrePiso(piso: number | null): string {
  if (piso == null) return "Sin piso";
  const sufijo = piso === 1 || piso === 3 ? "er" : piso === 2 ? "do" : "to";
  return `${piso}${sufijo} piso`;
}

// "Laboratorio del 3er piso (306 y 307)"
export function nombreLaboratorio(l: { piso: number | null; aulas: string }): string {
  return `Laboratorio del ${nombrePiso(l.piso)}${l.aulas ? ` (${l.aulas})` : ""}`;
}

// Minutos reales de monitoreo: se puede estar en los dos pisos a la vez, y ese rato cuenta una sola vez
// por persona (el tiempo de cada laboratorio sí cuenta completo). Solo rondas terminadas.
export function minutosMonitoreo(rondas: { email: string; inicio: string; fin: string | null }[]): number {
  const porPersona = new Map<string, [number, number][]>();
  for (const r of rondas) {
    if (!r.fin) continue;
    const tramos = porPersona.get(r.email) ?? [];
    tramos.push([new Date(r.inicio).getTime(), new Date(r.fin).getTime()]);
    porPersona.set(r.email, tramos);
  }
  let total = 0;
  for (const tramos of porPersona.values()) {
    tramos.sort((a, b) => a[0] - b[0]);
    let [desde, hasta] = tramos[0];
    for (const [i, f] of tramos.slice(1)) {
      if (i <= hasta) hasta = Math.max(hasta, f);
      else {
        total += hasta - desde;
        [desde, hasta] = [i, f];
      }
    }
    total += hasta - desde;
  }
  return Math.round(total / 60000);
}

export interface DatosMonitoreo {
  laboratorios: Laboratorio[];
  activos: Monitoreo[]; // las rondas abiertas: a lo más una por laboratorio
  recientes: Monitoreo[];
  hoy: { rondas: number; minutos: number };
  semana: { rondas: number; minutos: number; con_hallazgos: number };
  // Fotos de hoy por piso: se pide al menos una en la mañana y otra en la tarde (corte: 1 p. m.)
  fotos_hoy: { piso: number | null; manana: number; tarde: number }[];
}
