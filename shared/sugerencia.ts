import type { TipoFalla } from "./tipos";

// Palabras que delatan el tipo de falla en el detalle. Se buscan al inicio de una palabra,
// sin tildes ni mayúsculas: "imprim" encuentra "imprime" e "imprimir".
// Solo palabras claras: "no prende" o "no conecta" pueden ser de cualquier equipo.
const PALABRAS: Partial<Record<TipoFalla, string[]>> = {
  internet: ["internet", "wifi", "wi fi", "wi-fi", "red", "conexion", "router", "navega"],
  proyector: ["proyect", "hdmi", "vga", "sin senal", "imagen"],
  pc: ["pc", "computadora", "cpu", "windows", "monitor"],
  audio: ["audio", "parlante", "sonido", "volumen", "microfono", "bocina", "no se escucha"],
  impresora: ["imprim", "impresora", "toner", "tinta", "atasc"],
  perifericos: ["mouse", "raton", "teclado", "webcam", "camara web"],
};

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function aciertos(texto: string, palabras: string[]): number {
  return palabras.filter((p) => new RegExp(`(^|[^a-z0-9])${p.replace(/[-]/g, "\\-")}`).test(texto)).length;
}

// Si el detalle habla claramente de otra falla que la elegida, devuelve esa otra.
// No sugiere nada si el detalle también menciona la elegida o si dos tipos empatan.
export function sugerirTipo(detalle: string, elegido: TipoFalla | null): TipoFalla | null {
  if (!elegido || detalle.trim().length < 4) return null;
  const texto = normalizar(detalle);
  const puntos = Object.entries(PALABRAS).map(([tipo, palabras]) => [tipo as TipoFalla, aciertos(texto, palabras)] as const);
  if ((puntos.find(([t]) => t === elegido)?.[1] ?? 0) > 0) return null;
  const ordenados = puntos.filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (!ordenados.length || (ordenados[1] && ordenados[1][1] === ordenados[0][1])) return null;
  return ordenados[0][0];
}
