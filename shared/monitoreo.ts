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

export interface DatosMonitoreo {
  laboratorios: Laboratorio[];
  activo: Monitoreo | null;
  recientes: Monitoreo[];
  hoy: { rondas: number; minutos: number };
  semana: { rondas: number; minutos: number; con_hallazgos: number };
  // Fotos de hoy por piso: se pide al menos una en la mañana y otra en la tarde (corte: 1 p. m.)
  fotos_hoy: { piso: number | null; manana: number; tarde: number }[];
}
