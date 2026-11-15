// Eventos y actividades. Los registra TI; COA los ve.
// externo: actividades de instituciones o personas de fuera del colegio (o fuera del horario de clases) que usan
//          un aula o un patio y para las que TI deja listo el equipo.
// apoyo:   tareas de TI que no son una falla ni un daño, como subir hojas bond, con su hora de inicio y fin.

export type TipoEvento = "externo" | "apoyo";
export const ETIQUETA_TIPO_EVENTO: Record<TipoEvento, string> = {
  externo: "Evento externo",
  apoyo: "Actividad de apoyo",
};
export const TIPOS_EVENTO = Object.keys(ETIQUETA_TIPO_EVENTO) as TipoEvento[];

export type EstadoEvento = "programado" | "realizado" | "cancelado";

export const ETIQUETA_ESTADO_EVENTO: Record<EstadoEvento, string> = {
  programado: "Programado",
  realizado: "Realizado",
  cancelado: "Cancelado",
};
export const ESTADOS_EVENTO = Object.keys(ETIQUETA_ESTADO_EVENTO) as EstadoEvento[];

// Lo que TI tiene que dejar listo
export const EQUIPOS_EVENTO = {
  sonido: "Equipo de sonido",
  microfonos: "Micrófonos",
  proyector: "Proyector y ecran",
  laptop: "Laptop",
  internet: "Internet",
  extension: "Extensiones",
} as const;
export type EquipoEvento = keyof typeof EQUIPOS_EVENTO;
export const LISTA_EQUIPOS_EVENTO = Object.keys(EQUIPOS_EVENTO) as EquipoEvento[];

export interface Evento {
  id: number;
  tipo: TipoEvento;
  nombre: string; // nombre del evento o qué se hizo
  organiza: string | null;
  aula_id: number | null; // opcional en las actividades de apoyo
  aula_nombre: string | null;
  aula_espacio: "aula" | "patio" | null;
  inicio: string; // ISO
  fin: string | null;
  responsable: string | null;
  contacto: string | null;
  equipos: EquipoEvento[];
  notas: string | null;
  estado: EstadoEvento;
  nota_cierre: string | null;
  registrado_por: string;
  registrado_en: string;
  actualizado_por: string | null;
}
