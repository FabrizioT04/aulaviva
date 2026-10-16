// Tipos de falla. Los cuatro primeros se muestran siempre; los demás, al tocar "Ver más".
// Para agregar uno: este arreglo, su ícono en shared/iconos.ts y una migración que actualice el CHECK.
export const TIPOS_FALLA = ["internet", "proyector", "pc", "otro", "audio", "impresora", "perifericos"] as const;
export type TipoFalla = (typeof TIPOS_FALLA)[number];
export const TIPOS_PRINCIPALES: readonly TipoFalla[] = TIPOS_FALLA.slice(0, 4);

export const ETIQUETA_FALLA: Record<TipoFalla, string> = {
  internet: "Internet",
  proyector: "Proyector",
  pc: "PC",
  otro: "Otro",
  audio: "Audio",
  impresora: "Impresora",
  perifericos: "Periféricos",
};
export type EstadoReporte = "abierto" | "en_atencion" | "resuelto";
export type Semaforo = "verde" | "amarillo" | "rojo";

export interface AulaConEstado {
  id: number;
  codigo: string;
  nombre: string;
  piso: number | null;
  pabellon: string | null; // "A", "B" o "C"
  nivel: string | null; // Inicial, Primaria, Secundaria, Varios, Rotaciones
  seccion: string | null; // grado y sección que conocen los docentes, ej. "4A"
  semaforo: Semaforo;
  reportes_abiertos: number;
}

export interface Reporte {
  id: number;
  aula_id: number;
  aula_nombre: string;
  aula_seccion: string | null;
  tipo_falla: TipoFalla;
  bloquea_clase: number;
  descripcion: string | null;
  reportado_por_nombre: string | null;
  estado: EstadoReporte;
  origen: "whatsapp" | "qr"; // "whatsapp" = lo registró TI desde el panel
  entrada: EntradaReporte | EntradaTi | null; // por dónde llegó exactamente (null en los antiguos)
  reportado_en: string;
  atendido_en: string | null;
  resuelto_en: string | null;
  causa: string | null; // qué se encontró al revisar
  notas_resolucion: string | null; // qué se hizo para resolverlo
  fotos: number; // cuántas fotos de evidencia tiene (0 a 3)
}

// Ficha de solución escrita por TI para una falla común
export interface Ficha {
  id: number;
  tipo_falla: TipoFalla;
  titulo: string;
  sintomas: string | null;
  pasos_docente: string | null; // un paso por línea
  cuando_llamar_ti: string | null;
  creado_en: string;
  actualizado_en: string;
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

// Por dónde llegó el reporte del docente (ver migrations/0007_entrada.sql)
export const ENTRADAS = ["qr", "escaner", "lista"] as const;
export type EntradaReporte = (typeof ENTRADAS)[number];

// Por dónde le llegó a TI lo que registra desde el panel
export const ENTRADAS_TI = ["whatsapp", "presencial", "otro"] as const;
export type EntradaTi = (typeof ENTRADAS_TI)[number];

export interface Metricas {
  dias: number;
  resumen: Promedios & { total: number; abiertos: number | null; bloqueantes: number | null };
  por_tipo: { tipo_falla: TipoFalla; n: number }[];
  por_entrada: { entrada: EntradaReporte | EntradaTi; n: number }[];
  ranking_aulas: { id: number; codigo: string; nombre: string; n: number }[];
}

export interface Sesion {
  email: string;
  rol: "ti" | "docente" | "servicio"; // servicio = el reporte semanal del viernes
  modo: "access" | "local";
}

// Lo que ve el docente al escanear el QR de un aula
// Inicio del docente (/docente): aulas para elegir sin escanear
export interface AulasDocente {
  aulas: AulaConEstado[];
  email: string;
}

export interface EstadoAulaQr {
  aula: AulaConEstado;
  abiertos: Pick<Reporte, "id" | "tipo_falla" | "bloquea_clase" | "estado" | "reportado_en">[];
  prom_atencion_urgente_min: number | null; // promedio de los últimos 90 días
  email: string;
}
