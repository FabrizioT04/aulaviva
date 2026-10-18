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
  ecran: ["ecran", "ecram", "telon", "pantalla de proyeccion"],
};
const DEBILES: Partial<Record<TipoFalla, string[]>> = {
  pc: ["laptop", "portatil", "no enciende", "no prende", "se apaga", "se apago"],
  ecran: ["no baja", "no sube"],
};

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function aciertos(texto: string, palabras: string[] = []): number {
  return palabras.filter((p) => new RegExp(`(^|[^a-z0-9])${p.replace(/[-]/g, "\\-")}`).test(texto)).length;
}

function puntos(texto: string) {
  const tipos = [...new Set([...Object.keys(CLARAS), ...Object.keys(DEBILES)])] as TipoFalla[];
  return tipos.map((t) => [t, 2 * aciertos(texto, CLARAS[t]) + aciertos(texto, DEBILES[t])] as const);
}

// El tipo con más puntos (al menos minimo), o null si dos empatan
function mejor(lista: ReturnType<typeof puntos>, minimo: number): TipoFalla | null {
  const ordenados = lista.filter(([, n]) => n >= minimo).sort((a, b) => b[1] - a[1]);
  if (!ordenados.length || (ordenados[1] && ordenados[1][1] === ordenados[0][1])) return null;
  return ordenados[0][0];
}

// Si el detalle habla claramente de otra falla que la elegida, devuelve esa otra.
// No sugiere nada si el detalle también menciona la elegida, si dos tipos empatan
// o si solo hay pistas débiles sueltas.
export function sugerirTipo(detalle: string, elegido: TipoFalla | null): TipoFalla | null {
  if (!elegido || detalle.trim().length < 4) return null;
  const lista = puntos(normalizar(detalle));
  if ((lista.find(([t]) => t === elegido)?.[1] ?? 0) > 0) return null;
  return mejor(lista, 2);
}

// Un daño de equipo cuyo detalle dice que no funciona ("la laptop no prende") es una falla para TI.
// Devuelve el tipo de falla que se lee claro en el detalle, el del equipo elegido si no se lee ninguno, o null
// si no parece una falla
const NO_FUNCIONA = [
  "no funciona", "no prende", "no enciende", "no arranca", "se apaga", "se apago", "no carga", "no proyecta",
  "no detecta", "no conecta", "no se conecta", "no suena", "no se escucha", "no imprime", "no responde",
  "se congela", "se cuelga", "sin senal", "sin internet", "no hay internet",
];
export function fallaEnDano(detalle: string, delEquipo: TipoFalla): TipoFalla | null {
  const texto = normalizar(detalle);
  if (!aciertos(texto, NO_FUNCIONA)) return null;
  return mejor(puntos(texto), 2) ?? delEquipo;
}
