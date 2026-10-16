// Daños y mantenimiento: van aparte de las incidencias de TI y no cuentan en el semáforo
// ni en las métricas de TI. Las Chromebooks dañadas las sigue COA; el local, Mantenimiento.

export type AreaDano = "coa" | "mantenimiento";
export type EstadoDano = "pendiente" | "en_proceso" | "resuelto";

export const TIPOS_DANO = {
  chromebook_golpe: { area: "coa", etiqueta: "Golpeada o con la pantalla rota" },
  chromebook_cintillo: { area: "coa", etiqueta: "Cintillo de seguridad roto" },
  chromebook_manchada: { area: "coa", etiqueta: "Manchada, rayada o pintada" },
  chromebook_piezas: { area: "coa", etiqueta: "Le faltan teclas o piezas" },
  chromebook_otro: { area: "coa", etiqueta: "Otro daño de la Chromebook" },
  ventilador: { area: "mantenimiento", etiqueta: "Ventilador" },
  pared: { area: "mantenimiento", etiqueta: "Pared, piso o techo" },
  mobiliario: { area: "mantenimiento", etiqueta: "Carpetas, sillas o mesas" },
  puerta: { area: "mantenimiento", etiqueta: "Puerta, ventana o cerradura" },
  luz: { area: "mantenimiento", etiqueta: "Luz o fluorescente" },
  tomacorriente: { area: "mantenimiento", etiqueta: "Tomacorriente o interruptor" },
  mantenimiento_otro: { area: "mantenimiento", etiqueta: "Otro desperfecto del ambiente" },
} as const satisfies Record<string, { area: AreaDano; etiqueta: string }>;

export type TipoDano = keyof typeof TIPOS_DANO;
export const LISTA_TIPOS_DANO = Object.keys(TIPOS_DANO) as TipoDano[];
export const tiposDe = (area: AreaDano) => LISTA_TIPOS_DANO.filter((t) => TIPOS_DANO[t].area === area);

// Qué ve el que reporta (el grupo) y a quién le llega (el área)
export const GRUPO_DANO: Record<AreaDano, string> = { coa: "Chromebook", mantenimiento: "Mobiliario o infraestructura" };
export const ETIQUETA_AREA: Record<AreaDano, string> = { coa: "COA", mantenimiento: "Mantenimiento" };
export const ETIQUETA_ESTADO_DANO: Record<EstadoDano, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  resuelto: "Resuelto",
};
export const ESTADOS_DANO = Object.keys(ETIQUETA_ESTADO_DANO) as EstadoDano[];

export interface Dano {
  id: number;
  aula_id: number;
  aula_codigo: string;
  aula_nombre: string;
  area: AreaDano;
  tipo: TipoDano;
  equipo: string | null; // código o etiqueta de la Chromebook
  seccion: string | null; // sección del estudiante
  estudiante: string | null; // opcional: lo ven solo TI, COA y Mantenimiento
  descripcion: string | null;
  estado: EstadoDano;
  reportado_por: string; // correo
  reportado_en: string;
  resuelto_en: string | null;
  nota_cierre: string | null; // qué se hizo
  actualizado_por: string | null;
  fotos: number;
}
