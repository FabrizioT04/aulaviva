import type { Dano } from "./danos";
import type { Monitoreo } from "./monitoreo";
// Tipos de falla. Los cuatro primeros se muestran siempre; los demás, al tocar "Ver más".
// Para agregar uno: este arreglo, su etiqueta, su lugar en ORDEN_FALLAS, su ícono en shared/iconos.ts y su color en estilos.css.
// La base de datos no restringe el tipo (ver 0019_ecran.sql): lo valida el Worker.
export const TIPOS_FALLA = ["internet", "proyector", "pc", "otro", "audio", "impresora", "perifericos", "ecran"] as const;
export type TipoFalla = (typeof TIPOS_FALLA)[number];
export const TIPOS_PRINCIPALES: readonly TipoFalla[] = TIPOS_FALLA.slice(0, 4);

export const ETIQUETA_FALLA: Record<TipoFalla, string> = {
  internet: "Internet",
  proyector: "Proyector",
  pc: "Laptop / Computadora", // en el QR dice solo "Laptop" o "Computadora" según el ambiente (etiquetaFalla)
  otro: "Otro",
  audio: "Audio",
  impresora: "Impresora",
  perifericos: "Periféricos",
  ecran: "Ecran", // la pantalla de proyección de las aulas
};
// En las aulas se trabaja con laptops; donde hay All in One (Welcome Lobby, Sala de docentes) los docentes dicen "computadora"
export type EquipoAula = "laptop" | "aio";

// Fallas que se pueden reportar en un ambiente, en el orden en que se muestran (las 4 primeras siempre a la vista).
// Sin clases (Welcome Lobby, Sala de docentes) no hay proyector ni ecran; impresora y parlantes, solo donde se marcaron
const ORDEN_FALLAS: readonly TipoFalla[] = ["internet", "proyector", "pc", "impresora", "otro", "ecran", "audio", "perifericos"];
export function fallasDe(aula: Pick<AulaConEstado, "clases" | "impresora" | "audio">): TipoFalla[] {
  return ORDEN_FALLAS.filter(
    (t) => ((t !== "proyector" && t !== "ecran") || aula.clases) && (t !== "impresora" || aula.impresora) && (t !== "audio" || aula.audio),
  );
}

// Texto de una guía como lo lee el docente en ese ambiente: {red} es su red Wi-Fi ("aula_innova" en las aulas,
// la propia en el Welcome Lobby y la Sala de docentes), y donde hay All in One la "laptop" es la "computadora"
export function paraAmbiente(texto: string, aula: Pick<AulaConEstado, "red_wifi" | "equipo">): string {
  const conRed = texto.replaceAll("{red}", aula.red_wifi ? `la red "${aula.red_wifi}"` : "la red de docentes del colegio");
  if (aula.equipo !== "aio") return conRed;
  return conRed.replace(/\b(l)aptop(s?)\b/gi, (_, l: string, s: string) => `${l === "L" ? "C" : "c"}omputadora${s}`);
}

// Nombre de la falla como lo dice el docente en ese ambiente
export function etiquetaFalla(tipo: TipoFalla, equipo?: EquipoAula): string {
  if (tipo === "pc" && equipo) return equipo === "aio" ? "Computadora" : "Laptop";
  return ETIQUETA_FALLA[tipo];
}
export type EstadoReporte = "abierto" | "en_atencion" | "escalado" | "resuelto";
export type Semaforo = "verde" | "amarillo" | "rojo";

export interface AulaConEstado {
  id: number;
  codigo: string;
  nombre: string;
  piso: number | null;
  pabellon: string | null; // "A", "B" o "C"
  nivel: string | null; // Inicial, Primaria, Secundaria, Varios, Rotaciones
  seccion: string | null; // grado y sección que conocen los docentes, ej. "4A"
  equipo: EquipoAula;
  clases: number; // 1 si se dictan clases (tiene proyector); 0 en el Welcome Lobby y la Sala de docentes
  impresora: number; // 1 si tiene impresora de red
  audio: number; // 1 si tiene parlantes
  red_wifi: string | null; // red Wi-Fi del ambiente: "aula_innova" en las aulas, la propia en el WL y la SD
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
  observaciones: string | null; // verificaciones, avances o lo que queda pendiente
  ticket_glpi: string | null; // número del ticket cuando se escala
  escalado_en: string | null;
  registrado_por: string | null; // correo de quien lo registró
  fotos: number; // cuántas fotos de evidencia tiene (0 a 3)
  ficha_vista: string | null; // título de la ficha cuyos pasos vio el docente en el QR antes de avisar
}

// Un cambio de estado de un reporte (ver migrations/0011_atencion_tecnica.sql)
export interface EventoReporte {
  reporte_id: number;
  estado: EstadoReporte;
  email: string | null;
  nota: string | null;
  en: string;
}

// Casos parecidos a un reporte (GET /api/reportes/:id/similares)
// Casos resueltos y fichas que se parecen al reporte que se está resolviendo.
// criterio "texto": comparten palabras con el detalle (coincide dice cuáles) y relevancia va de 0 a 1.
// criterio "tipo": el reporte no tiene detalle, así que son los últimos de la misma falla (relevancia null).
export interface Similares {
  criterio: "texto" | "tipo";
  casos: (Reporte & { coincide: string[]; relevancia: number | null })[];
  fichas: (Ficha & { coincide: string[]; relevancia: number | null })[];
}

// Ficha de solución escrita por TI para una falla común
export interface Ficha {
  id: number;
  tipo_falla: TipoFalla;
  titulo: string;
  sintomas: string | null;
  causas_posibles: string | null;
  pasos_docente: string | null; // un paso por línea
  pasos_ti: string | null; // procedimiento que solo hace TI, un paso por línea
  cuando_llamar_ti: string | null;
  creado_en: string;
  actualizado_en: string;
}

// Mensaje que el Durable Object envía a los dashboards abiertos
// "cambio": cambió el estado de un aula (reportes). "danos": se registró o cambió un daño.
export type EventoEnVivo = { tipo: "cambio"; aula: AulaConEstado } | { tipo: "danos" };

export interface Promedios {
  prom_atencion_min: number | null;
  prom_resolucion_min: number | null;
}

export interface DetalleAula {
  aula: AulaConEstado;
  reportes: Reporte[];
  eventos: EventoReporte[]; // historial de cambios de esos reportes, del más antiguo al más nuevo
  resumen: Promedios & { total: number };
}

// Por dónde llegó el reporte del docente (ver migrations/0007_entrada.sql)
export const ENTRADAS = ["qr", "escaner", "lista"] as const;
export type EntradaReporte = (typeof ENTRADAS)[number];

// Por dónde le llegó a TI lo que registra desde el panel
export const ENTRADAS_TI = ["whatsapp", "presencial", "otro"] as const;
export type EntradaTi = (typeof ENTRADAS_TI)[number];

// Historial: un mes (o todo, con mes en null) con sus reportes, sus daños y el resumen del Observatorio
export interface Historial {
  mes: string | null;
  meses: { mes: string; fallas: number; danos: number; rondas?: number }[];
  resumen: Metricas["resumen"];
  reportes: Reporte[];
  danos: Dano[];
  // Rondas terminadas en los laboratorios ML: solo para quien las hace y COA (ver worker/monitoreo.ts)
  monitoreo?: { rondas: Monitoreo[]; minutos: number };
}

export interface Metricas {
  dias: number;
  resumen: Promedios & { total: number; abiertos: number | null; bloqueantes: number | null; escalados: number | null };
  por_tipo: { tipo_falla: TipoFalla; n: number }[];
  por_entrada: { entrada: EntradaReporte | EntradaTi; n: number }[];
  ranking_aulas: { id: number; codigo: string; nombre: string; n: number }[];
  por_dia: { dia: string; n: number }[]; // AAAA-MM-DD en hora de Lima; los días sin reportes no vienen
  por_estado: { estado: "pendiente" | "escalado" | "resuelto"; n: number }[];
  recurrentes: Recurrente[];
  // Asistencia guiada del QR: cuántas veces el docente lo solucionó con los pasos de una ficha,
  // y cuántas vio los pasos pero igual tuvo que avisar a TI
  autosolucion: { resueltas: number; avisaron: number };
}

// La misma falla repetida en un aula, con las causas que TI registró al resolverla
export interface Recurrente {
  id: number;
  codigo: string;
  nombre: string;
  tipo_falla: TipoFalla;
  n: number;
  ultima: string;
  con_causa: number; // cuántas de las n tienen causa registrada
  causas: string[]; // causas distintas, tal como se escribieron
}

export interface Sesion {
  email: string;
  rol: "ti" | "coa" | "docente" | "servicio"; // servicio = el reporte semanal del viernes; coa = COA, ve todo y solo cambia Daños
  modo: "access" | "local";
  monitorea?: boolean; // ve la pestaña Monitoreo ML (solo /api/sesion lo dice)
}

// Lo que ve el docente al escanear el QR de un aula
// Inicio del docente (/docente): aulas para elegir sin escanear
export interface AulasDocente {
  aulas: AulaConEstado[];
  email: string;
  mios: MiReporte[];
}

// Lo que el docente reportó hace poco (fallas y daños), para que sepa en qué va sin preguntar por WhatsApp.
// Los resueltos se muestran 7 días; los demás, hasta que se resuelvan.
export interface MiReporte {
  clase: "reporte" | "dano";
  id: number;
  tipo: string; // tipo_falla, o el tipo de daño
  titulo: string;
  aula_codigo: string;
  aula_nombre: string;
  estado: EstadoMiReporte;
  reportado_en: string;
  resuelto_en: string | null;
}

// Los estados de reportes y daños, en palabras del docente
export type EstadoMiReporte = "recibido" | "en_atencion" | "escalado" | "resuelto";

export interface EstadoAulaQr {
  aula: AulaConEstado;
  abiertos: Pick<Reporte, "id" | "tipo_falla" | "bloquea_clase" | "estado" | "reportado_en">[];
  espera_urgente_min: number | null; // mediana de los urgentes de los últimos 90 días, del reporte a la llegada de TI
  email: string;
  mios: MiReporte[]; // los del docente en esta aula, también los resueltos hace poco
  guias: GuiaDocente[]; // pasos que el docente puede probar antes de avisar, por tipo de falla
}

// Pasos de una ficha que el docente puede probar solo (los escribe TI en la Base de conocimiento)
export interface GuiaDocente {
  id: number;
  tipo_falla: TipoFalla;
  titulo: string;
  pasos: string[];
  cuando_llamar_ti: string | null;
}
