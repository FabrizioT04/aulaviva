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
  aula_nombre: string;
  aula_seccion: string | null;
  inicio: string;
  fin: string | null;
  hallazgos: Hallazgo[]; // vacío = todo en orden
  nota: string | null;
}

export interface AulaMl {
  id: number;
  nombre: string;
  seccion: string | null;
  piso: number | null;
}

export interface DatosMonitoreo {
  aulas: AulaMl[];
  activo: Monitoreo | null;
  recientes: Monitoreo[];
  hoy: { rondas: number; minutos: number };
  semana: { rondas: number; minutos: number; con_hallazgos: number };
}
