// Qué tan parecidos son dos textos de fallas, por las palabras que comparten.
// No es IA: compara raíces de palabras ("enciende" y "encendió" comparten "encen"),
// sin tildes y sin palabras que no dicen nada ("no", "el", "funciona").
// Sirve para no mostrar como "parecido" un caso de PC sin internet cuando la PC no enciende.

const VACIAS = new Set(
  `de del la las el los un una unos unas y o u en con por para no ni se que al lo le les su sus es son esta este estan
  esto eso ya muy mas pero sin hay me mi mis te tu nos hace hizo todo toda todos nada algo otra otro otros cuando como
  donde porque pues tambien solo aula clase docente profesor profesora alumno alumnos falla fallas funciona funcionan
  anda sirve problema hoy ayer dia momento rato poco favor ayuda ayudar puede pueden revisar revise reviso estaba estaban
  tiene tienen tenia sale salio dice dijo cuando`.split(/\s+/),
);

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// El equipo casi siempre es el mismo dentro de un tipo de falla ("laptop" en PC): coincidir solo en él
// no hace parecidos dos casos. Cuenta para mostrar en qué coinciden, pero hace falta algo más.
const EQUIPOS = new Set(["lapto", "porta", "compu", "pc", "cpu", "equip", "proye", "impre", "parla", "mouse", "tecla"]);
// Dos formas de decir lo mismo
const SINONIMOS: Record<string, string> = { prend: "encen" };

// Raíz corta de cada palabra útil, con la palabra original para mostrar en qué coinciden.
// "ie" y "ue" se igualan a "e" y "o" para que "enciende" y "encender" tengan la misma raíz
export function raices(texto: string | null | undefined): Map<string, string> {
  const salida = new Map<string, string>();
  for (const original of (texto ?? "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    const palabra = normalizar(original);
    if (palabra.length < 2 || VACIAS.has(palabra)) continue;
    const corta = palabra.replace(/ie/g, "e").replace(/ue/g, "o").slice(0, 5);
    const raiz = SINONIMOS[corta] ?? corta;
    if ((raiz.length >= 3 || raiz === "pc") && !salida.has(raiz)) salida.set(raiz, original);
  }
  return salida;
}

// Palabras del texto buscado que también aparecen en el otro.
// Vacío si solo coinciden en el nombre del equipo
export function coincidencias(buscado: Map<string, string>, otro: string | null | undefined): string[] {
  const delOtro = raices(otro);
  const comunes = [...buscado].filter(([raiz]) => delOtro.has(raiz));
  if (!comunes.some(([raiz]) => !EQUIPOS.has(raiz))) return [];
  return comunes.map(([, palabra]) => palabra);
}
