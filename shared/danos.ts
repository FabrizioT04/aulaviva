// Daños y mantenimiento: van aparte de las incidencias de TI y no cuentan en el semáforo
// ni en las métricas de TI. Los equipos tecnológicos los atiende TI y COA solo los ve;
// los desperfectos del local los atiende COA. TI es el administrador: ve y cambia todo.

export type GrupoDano = "tecnologia" | "local";
export type EstadoDano = "pendiente" | "en_proceso" | "resuelto";

export const TIPOS_DANO = {
  chromebook_golpe: { grupo: "tecnologia", etiqueta: "Chromebook golpeada o con la pantalla rota" },
  chromebook_cintillo: { grupo: "tecnologia", etiqueta: "Chromebook con el cintillo de seguridad roto" },
  chromebook_manchada: { grupo: "tecnologia", etiqueta: "Chromebook manchada, rayada o pintada" },
  chromebook_piezas: { grupo: "tecnologia", etiqueta: "A la Chromebook le faltan teclas o piezas" },
  laptop: { grupo: "tecnologia", etiqueta: "Laptop o computadora dañada" },
  proyector: { grupo: "tecnologia", etiqueta: "Proyector o parlante dañado" },
  tecnologia_otro: { grupo: "tecnologia", etiqueta: "Otro equipo dañado" },
  ventilador: { grupo: "local", etiqueta: "Ventilador" },
  pared: { grupo: "local", etiqueta: "Pared, piso o techo" },
  mobiliario: { grupo: "local", etiqueta: "Carpetas, sillas o mesas" },
  puerta: { grupo: "local", etiqueta: "Puerta, ventana o cerradura" },
  luz: { grupo: "local", etiqueta: "Luz o fluorescente" },
  tomacorriente: { grupo: "local", etiqueta: "Tomacorriente o interruptor" },
  local_otro: { grupo: "local", etiqueta: "Otro desperfecto del ambiente" },
} as const satisfies Record<string, { grupo: GrupoDano; etiqueta: string }>;

export type TipoDano = keyof typeof TIPOS_DANO;
export const LISTA_TIPOS_DANO = Object.keys(TIPOS_DANO) as TipoDano[];
export const tiposDe = (grupo: GrupoDano) => LISTA_TIPOS_DANO.filter((t) => TIPOS_DANO[t].grupo === grupo);

export const GRUPO_DANO: Record<GrupoDano, string> = { tecnologia: "Chromebook u otro equipo", local: "Mobiliario o infraestructura" };
// COA entra con el secreto COA_EMAILS
export const EQUIPO_DANOS = "COA";
// Quién atiende cada grupo (lo registra, lo pasa a En proceso y lo cierra) y a quién le llega
export const ATIENDE_DANO: Record<GrupoDano, "ti" | "coa"> = { tecnologia: "ti", local: "coa" };
export const ETIQUETA_ATIENDE: Record<"ti" | "coa", string> = { ti: "TI", coa: EQUIPO_DANOS };
export const DESTINO_DANO: Record<GrupoDano, string> = { tecnologia: `TI y a ${EQUIPO_DANOS}`, local: EQUIPO_DANOS };
export const puedeEditarDano = (rol: string, grupo: GrupoDano) => rol === "ti" || ATIENDE_DANO[grupo] === rol;
// TI y COA ven los dos grupos
export const gruposQueVe = (_rol: string): GrupoDano[] => ["tecnologia", "local"];
export const gruposQueAtiende = (rol: string): GrupoDano[] => (["tecnologia", "local"] as const).filter((g) => puedeEditarDano(rol, g));
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
  grupo: GrupoDano;
  tipo: TipoDano;
  equipo: string | null; // código o etiqueta del equipo
  seccion: string | null; // sección del estudiante
  estudiante: string | null; // opcional: lo ven solo TI y COA
  descripcion: string | null;
  estado: EstadoDano;
  reportado_por: string; // correo
  reportado_en: string;
  resuelto_en: string | null;
  nota_cierre: string | null; // qué se hizo
  actualizado_por: string | null;
  fotos: number;
}

// Resumen de la pestaña Daños: lo abierto ahora y lo de los últimos días
export interface MetricasDanos {
  dias: number;
  pendientes: number;
  en_proceso: number;
  abierto_mas_antiguo: string | null; // reportado_en del daño abierto más antiguo
  registrados: number;
  resueltos: number;
  prom_atencion_min: number | null; // de registrado a resuelto, en los resueltos del periodo
}
