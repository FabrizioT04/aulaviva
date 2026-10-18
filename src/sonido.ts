// Sonido propio de AulaViva, para reconocer los avisos de la plataforma. TI elige el tono en el menú de la campana.
// Lo genera el navegador con Web Audio, sin archivos. Suena con el panel abierto en alguna pestaña,
// aunque esté minimizado; con el navegador cerrado, la notificación usa el sonido del sistema.

const CLAVE = "aulaviva:sonido";

// f: frecuencia en Hz, t: cuándo empieza (s), d: cuánto dura (s), v: volumen, hasta: frecuencia final si se desliza
type Nota = { f: number; t: number; d: number; v: number; onda?: OscillatorType; hasta?: number };
type Tono = { nombre: string; largo: number; notas: Nota[] };

// Un parcial a 2,76 veces la nota le da el timbre de campana de metal
const campana = (f: number, t: number, d: number, v: number): Nota[] => [
  { f, t, d, v },
  { f: f * 2.76, t, d: d * 0.4, v: v * 0.3 },
];

export const TONOS = {
  campanita: {
    nombre: "Campanita",
    largo: 0.6,
    notas: [659.25, 783.99, 1046.5].map((f, i) => ({ f, t: i * 0.13, d: 0.35, v: 0.25 })),
  },
  timbre: {
    nombre: "Timbre",
    largo: 1.1,
    notas: [
      { f: 659.25, t: 0, d: 0.7, v: 0.3, onda: "triangle" },
      { f: 523.25, t: 0.4, d: 0.9, v: 0.3, onda: "triangle" },
    ],
  },
  marimba: {
    nombre: "Marimba",
    largo: 0.55,
    notas: [523.25, 659.25, 783.99, 1046.5].map((f, i) => ({ f, t: i * 0.08, d: 0.2, v: 0.3, onda: "triangle" as const })),
  },
  burbuja: {
    nombre: "Burbuja",
    largo: 0.45,
    notas: [
      { f: 500, hasta: 1100, t: 0, d: 0.12, v: 0.28 },
      { f: 700, hasta: 1500, t: 0.16, d: 0.12, v: 0.28 },
    ],
  },
  cristal: {
    nombre: "Cristal",
    largo: 1.2,
    notas: [...campana(1046.5, 0, 1.2, 0.22), ...campana(1567.98, 0.18, 1, 0.18)],
  },
  alerta: {
    nombre: "Alerta",
    largo: 0.8,
    notas: [
      ...[0, 0.14, 0.28].map((t) => ({ f: 880, t, d: 0.1, v: 0.22, onda: "square" as const })),
      { f: 1318.5, t: 0.42, d: 0.28, v: 0.2, onda: "square" },
    ],
  },
} satisfies Record<string, Tono>;

export type IdTono = keyof typeof TONOS;
export const LISTA_TONOS = Object.keys(TONOS) as IdTono[];

let contexto: AudioContext | null = null;

// null: sin sonido. Antes solo se guardaba "si" o "no"; "si" equivale al tono de siempre
export function tonoElegido(): IdTono | null {
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado === "no") return null;
    return guardado && guardado in TONOS ? (guardado as IdTono) : "campanita";
  } catch {
    return "campanita";
  }
}

export function guardarTono(tono: IdTono | null): void {
  try {
    localStorage.setItem(CLAVE, tono ?? "no");
  } catch {
    // sin almacenamiento: queda el tono de siempre
  }
}

// El navegador solo deja sonar audio después de un clic o una tecla en la página
export function prepararSonido(): void {
  try {
    contexto ??= new AudioContext();
    if (contexto.state === "suspended") void contexto.resume();
  } catch {
    // sin Web Audio
  }
}

// Sin tono, usa el elegido; si TI apagó el sonido, no suena
export function sonar(urgente = false, tono: IdTono | null = tonoElegido()): void {
  if (!tono) return;
  prepararSonido();
  if (!contexto) return;
  const { notas, largo }: Tono = TONOS[tono];
  const inicio = contexto.currentTime + 0.02;
  const veces = urgente ? 2 : 1;
  for (let v = 0; v < veces; v++) {
    for (const nota of notas) {
      const t = inicio + v * largo + nota.t;
      const osc = contexto.createOscillator();
      const volumen = contexto.createGain();
      osc.type = nota.onda ?? "sine";
      osc.frequency.setValueAtTime(nota.f, t);
      if (nota.hasta) osc.frequency.exponentialRampToValueAtTime(nota.hasta, t + nota.d);
      volumen.gain.setValueAtTime(0, t);
      volumen.gain.linearRampToValueAtTime(nota.v, t + 0.01);
      volumen.gain.exponentialRampToValueAtTime(0.001, t + nota.d);
      osc.connect(volumen).connect(contexto.destination);
      osc.start(t);
      osc.stop(t + nota.d + 0.01);
    }
  }
}
