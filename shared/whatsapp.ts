// Reportes que llegan al WhatsApp Business de la sede (ver docs/whatsapp.md y worker/whatsapp.ts).
// Aquí está lo que se lee del mensaje del docente: el aula, la falla y si es urgente. Son reglas, no IA.
import { diceQueNoFunciona, normalizar, tipoEnTexto } from "./sugerencia";
import type { AulaConEstado, TipoFalla } from "./tipos";

export type AulaLeible = Pick<AulaConEstado, "id" | "codigo" | "nombre" | "seccion" | "espacio">;

// Sin tildes y con espacios simples; "4°A" queda como "4 grado a"
function limpiar(texto: string): string {
  return normalizar(texto).replace(/[°º]/g, " grado ").replace(/["'´`]/g, " ").replace(/\s+/g, " ").trim();
}

const palabra = (p: string) => new RegExp(`(^|[^a-z0-9])${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`);

// Grado y sección escritos de varias formas: "4A", "4to A", "4 to A", "4° A", "11B", "5to grado B"
function seccionesEnTexto(t: string): Set<string> {
  const secciones = new Set<string>();
  const juntas = /(?:^|[^a-z0-9])(\d{1,2})([abc])(?![a-z0-9])/g;
  const separadas = /(?:^|[^a-z0-9])(\d{1,2}) ?(?:ro|do|to|er|vo|mo|no)? ?(?:grado )?(?:seccion )?([abc])(?![a-z0-9])/g;
  for (const m of t.matchAll(juntas)) secciones.add(`${m[1]}${m[2]}`.toUpperCase());
  // Con espacio solo si hay ordinal o "grado": "de 3 a 4" no es 3A
  for (const m of t.matchAll(separadas)) {
    if (/\d (ro|do|to|er|vo|mo|no|grado|seccion)\b/.test(m[0]) || /\d(ro|do|to|er|vo|mo|no) /.test(m[0])) {
      secciones.add(`${m[1]}${m[2]}`.toUpperCase());
    }
  }
  return secciones;
}

// Otras formas de nombrar los ambientes que no son aulas
const OTROS_NOMBRES: Record<string, string[]> = {
  WL: ["welcome", "lobby", "wl"],
  SD: ["sala de docentes", "sala de profesores", "sala docente", "sala de profes"],
};

// El aula que menciona el mensaje: por número ("204", "aula 204"), por sección ("4A", "4to A") o por nombre
// ("Welcome Lobby", "patio"). Si menciona dos o no se entiende, null: es mejor preguntar que adivinar.
export function aulaEnTexto<A extends AulaLeible>(texto: string, aulas: A[]): A | null {
  const t = limpiar(texto);
  const secciones = seccionesEnTexto(t);
  const encontradas = new Set<A>();
  for (const a of aulas) {
    const codigo = a.codigo.toLowerCase();
    if (/^\d+$/.test(codigo)) {
      if (new RegExp(`(^|[^0-9])${codigo}([^0-9]|$)`).test(t)) encontradas.add(a);
    } else if (palabra(codigo).test(t) || palabra(limpiar(a.nombre)).test(t) || OTROS_NOMBRES[a.codigo]?.some((p) => palabra(p).test(t))) {
      encontradas.add(a);
    }
    if (a.espacio === "patio" && palabra("patio").test(t)) encontradas.add(a);
    for (const parte of (a.seccion ?? "").toUpperCase().split("/")) {
      if (/^\d/.test(parte) && secciones.has(parte)) encontradas.add(a);
      // Inicial: "KA", "PKB", "BA". "ML" no, porque hay un ML en cada piso
      if (/^[A-Z]{2,3}$/.test(parte) && parte !== "ML" && palabra(parte.toLowerCase()).test(t)) encontradas.add(a);
    }
  }
  return encontradas.size === 1 ? [...encontradas][0] : null;
}

// Si la clase no puede seguir, el reporte llega como urgente (como "No puedo continuar mi clase" del QR)
export function esUrgente(texto: string): boolean {
  const t = limpiar(texto);
  return /urgen|no puedo (continuar|seguir|dictar|empezar|iniciar|avanzar)|no podemos (continuar|seguir|empezar)|clase (detenida|parada)|lo antes posible|rapido por favor/.test(t);
}

// ¿El mensaje es un reporte? Nombra una falla, o dice que algo no funciona.
// Si dice que es urgente también, aunque no diga qué falla. Un saludo, un "gracias" o una conversación cualquiera no: esos los sigue leyendo TI en la app.
export function pareceReporte(texto: string): boolean {
  return tipoEnTexto(texto) != null || diceQueNoFunciona(texto) || esUrgente(texto);
}

export { tipoEnTexto };

// Respuestas cortas a "¿Es en el aula 204?"
export const esSi = (texto: string) => /^(si|sip|ya|ok|okey|correcto|claro|exacto|esa|asi es|afirmativo)\b/.test(limpiar(texto));
export const esNo = (texto: string) => /^(no|nop|otra)\b/.test(limpiar(texto));

// Un mensaje de WhatsApp que todavía no es un reporte (bandeja "Por clasificar" del dashboard)
export interface BorradorWhatsapp {
  id: number;
  telefono: string;
  nombre: string | null;
  texto: string | null;
  aula_id: number | null;
  aula_nombre: string | null;
  tipo_falla: TipoFalla | null;
  bloquea_clase: number;
  fotos: number;
  paso: "confirmar_aula" | "aula" | "falla" | null;
  recibido_en: string;
  actualizado_en: string;
  esperando: boolean; // Hazio le hizo una pregunta hace poco y el docente todavía puede responder
}

// Minutos en que una pregunta de Hazio sigue esperando respuesta. Después, el mensaje queda para que TI lo clasifique
// y lo siguiente que escriba el docente se toma como un reporte nuevo.
export const MINUTOS_RESPUESTA = 30;
