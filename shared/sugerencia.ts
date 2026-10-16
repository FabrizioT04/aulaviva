import type { TipoFalla } from "./tipos";

// Palabras que delatan el tipo de falla en el detalle. Se buscan al inicio de una palabra,
// sin tildes ni mayúsculas: "imprim" encuentra "imprime" e "imprimir".
// Las claras valen 2 puntos; las que solas no bastan valen 1. "Laptop" puede salir al hablar
// del proyector, y "no prende" sirve para cualquier equipo, pero juntas ("la laptop no enciende")
// suman lo mismo que una palabra clara.
const CLARAS: Partial<Record<TipoFalla, string[]>> = {
  internet: ["internet", "wifi", "wi fi", "wi-fi", "red", "conexion", "router", "navega"],
  proyector: ["proyect", "hdmi", "vga", "sin senal", "imagen"],
  pc: ["pc", "computadora", "cpu", "windows", "ubuntu", "linux", "monitor", "all in one", "aio"],
  audio: ["audio", "parlante", "sonido", "volumen", "microfono", "bocina", "no se escucha"],
  impresora: ["imprim", "impresora", "toner", "tinta", "atasc"],
  perifericos: ["mouse", "raton", "teclado", "webcam", "camara web"],
};
const DEBILES: Partial<Record<TipoFalla, string[]>> = {
  pc: ["laptop", "portatil", "no enciende", "no prende", "se apaga", "se apago"],
};

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function aciertos(texto: string, palabras: string[] = []): number {
  return palabras.filter((p) => new RegExp(`(^|[^a-z0-9])${p.replace(/[-]/g, "\\-")}`).test(texto)).length;
}

// Si el detalle habla claramente de otra falla que la elegida, devuelve esa otra.
// No sugiere nada si el detalle también menciona la elegida, si dos tipos empatan
// o si solo hay pistas débiles sueltas.
export function sugerirTipo(detalle: string, elegido: TipoFalla | null): TipoFalla | null {
  if (!elegido || detalle.trim().length < 4) return null;
  const texto = normalizar(detalle);
  const tipos = [...new Set([...Object.keys(CLARAS), ...Object.keys(DEBILES)])] as TipoFalla[];
  const puntos = tipos.map((t) => [t, 2 * aciertos(texto, CLARAS[t]) + aciertos(texto, DEBILES[t])] as const);
  if ((puntos.find(([t]) => t === elegido)?.[1] ?? 0) > 0) return null;
  const ordenados = puntos.filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
  if (!ordenados.length || (ordenados[1] && ordenados[1][1] === ordenados[0][1])) return null;
  return ordenados[0][0];
}
