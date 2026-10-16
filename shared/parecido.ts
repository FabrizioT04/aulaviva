// Qué tan parecidos son dos textos de fallas, por los síntomas que comparten.
// No es IA: compara raíces de palabras ("enciende" y "encendió" comparten "encen"), sin tildes
// y sin palabras que no dicen nada ("el", "funciona"). Respeta el "no" ("enciende" y "no enciende"
// son lo contrario) y entiende algunas formas de decir lo mismo ("no prende" = "no enciende").
// Sirve para no mostrar como "parecido" un caso de PC sin internet cuando la PC no enciende.

const VACIAS = new Set(
  `de del la las el los un una unos unas y o u en con por para se que al lo le les su sus es son esta este estan
  esto eso ya muy mas pero hay me mi mis te tu nos hace hizo todo toda todos nada algo otra otro otros cuando como
  donde porque pues tambien solo aula clase docente profesor profesora alumno alumnos falla fallas funciona funcionan
  anda sirve problema hoy ayer dia momento rato poco favor ayuda ayudar puede pueden revisar revise reviso estaba estaban
  tiene tienen tenia sale salio dice dijo`.split(/\s+/),
);

// "no" y "sin" cambian el sentido: "enciende" y "no enciende" son lo contrario.
// Se pegan a la siguiente palabra que describe el síntoma ("no se enciende" → no+enciende)
const NEGACIONES = new Set(["no", "sin", "nunca", "ni", "tampoco"]);

// El equipo casi siempre es el mismo dentro de un tipo de falla ("laptop" en PC): coincidir solo en él
// no hace parecidos dos casos, ni cuenta para medir cuánto se parecen.
const EQUIPOS = new Set(["lapto", "porta", "compu", "pc", "cpu", "equip", "proye", "impre", "parla", "mouse", "tecla"]);

// Formas distintas de decir el mismo síntoma. La clave es la raíz (con "!" si va negada)
const EQUIVALENCIAS: Record<string, string> = {
  prend: "encen", // prende = enciende
  "!prend": "!encen",
  conex: "inter", // conexión = internet
  "!conex": "!inter",
  wifi: "inter",
  "!wifi": "!inter",
  red: "inter",
  "!red": "!inter",
  "!mostr": "!image", // no muestra imagen = sin imagen
  "!proye": "!image", // no proyecta = sin imagen
};

// Síntomas que no son lo mismo pero suelen ir juntos: cuentan la mitad.
// "Sin alimentación eléctrica" se parece a "no enciende", pero no es igual
const RELACIONADAS: Record<string, string> = {
  "!alime": "!encen",
  "!energ": "!encen",
  "!corri": "!encen", // sin corriente
  apaga: "!encen", // se apaga sola
  apago: "!encen",
};

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const raizDe = (palabra: string) => palabra.replace(/ie/g, "e").replace(/ue/g, "o").slice(0, 5);

export interface Sintoma {
  texto: string; // cómo se escribió, para mostrar en qué coinciden
  relacionada?: string;
}

// Síntomas de un texto, por raíz
export function raices(texto: string | null | undefined): Map<string, Sintoma> {
  const salida = new Map<string, Sintoma>();
  // Por oraciones, para que un "no" no alcance a la frase siguiente
  for (const frase of (texto ?? "").toLowerCase().split(/[.,;:!?()\n]+/)) {
    let negador: string | null = null;
    let alcance = 0;
    for (const original of frase.match(/[\p{L}\p{N}]+/gu) ?? []) {
      const palabra = normalizar(original);
      if (NEGACIONES.has(palabra)) {
        negador = original;
        alcance = 3;
        continue;
      }
      if (palabra.length < 2 || VACIAS.has(palabra)) {
        if (alcance > 0 && --alcance === 0) negador = null;
        continue;
      }
      const raiz = raizDe(palabra);
      if (raiz.length < 3 && raiz !== "pc") continue;
      // El equipo no recibe la negación: en "no proyecta" sí ("!proye" = sin imagen), en "no la laptop" no
      const negada = negador && !(EQUIPOS.has(raiz) && !EQUIVALENCIAS[`!${raiz}`]);
      const clave = negada ? `!${raiz}` : raiz;
      const final = EQUIVALENCIAS[clave] ?? clave;
      // "no muestra imagen": "imagen" ya va dentro de "sin imagen"
      if (!negada && salida.has(`!${final}`)) continue;
      if (!salida.has(final)) salida.set(final, { texto: negada ? `${negador} ${original}` : original, relacionada: RELACIONADAS[final] });
      if (negada) negador = null;
    }
  }
  return salida;
}

const util = (raiz: string) => !EQUIPOS.has(raiz.replace(/^!/, ""));

// Qué tanto coincide un síntoma con los del otro texto: 1 si es el mismo, 0.5 si es uno relacionado
function cuanto(raiz: string, sintoma: Sintoma, otro: Map<string, Sintoma>): number {
  if (otro.has(raiz)) return 1;
  const relacionados = [...otro].some(([r, s]) => s.relacionada === raiz || (sintoma.relacionada && (r === sintoma.relacionada || s.relacionada === sintoma.relacionada)));
  return relacionados ? 0.5 : 0;
}

// Síntomas del texto buscado que también están en el otro, y qué parte de los síntomas buscados cubren (0 a 1).
// Vacío si solo coinciden en el nombre del equipo
export function comparar(buscado: Map<string, Sintoma>, otro: string | null | undefined): { palabras: string[]; fraccion: number } {
  const delOtro = raices(otro);
  const comunes = [...buscado].map(([raiz, s]) => ({ raiz, texto: s.texto, valor: cuanto(raiz, s, delOtro) })).filter((c) => c.valor > 0);
  const utiles = comunes.filter((c) => util(c.raiz));
  if (utiles.length === 0) return { palabras: [], fraccion: 0 };
  const total = [...buscado.keys()].filter(util).length;
  const suma = utiles.reduce((n, c) => n + c.valor, 0);
  return { palabras: comunes.map((c) => c.texto), fraccion: total ? suma / total : 0 };
}
