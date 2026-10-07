export type TipoFalla = "internet" | "proyector" | "pc" | "otro";
export type EstadoReporte = "abierto" | "en_atencion" | "resuelto";
export type Semaforo = "verde" | "amarillo" | "rojo";

export interface AulaConEstado {
  id: number;
  codigo: string;
  nombre: string;
  piso: number | null;
  semaforo: Semaforo;
  reportes_abiertos: number;
}

export interface Reporte {
  id: number;
  aula_id: number;
  aula_nombre: string;
  tipo_falla: TipoFalla;
  bloquea_clase: number;
  descripcion: string | null;
  reportado_por_nombre: string | null;
  estado: EstadoReporte;
  reportado_en: string;
  atendido_en: string | null;
  resuelto_en: string | null;
  notas_resolucion: string | null;
}

// Mensaje que el Durable Object envía a los dashboards abiertos
export interface EventoEnVivo {
  tipo: "cambio";
  aula: AulaConEstado;
}

export interface Promedios {
  prom_atencion_min: number | null;
  prom_resolucion_min: number | null;
}

export interface DetalleAula {
  aula: AulaConEstado;
  reportes: Reporte[];
  resumen: Promedios & { total: number };
}

export interface Metricas {
  dias: number;
  resumen: Promedios & { total: number; abiertos: number | null; bloqueantes: number | null };
  por_tipo: { tipo_falla: TipoFalla; n: number }[];
  ranking_aulas: { id: number; codigo: string; nombre: string; n: number }[];
}
