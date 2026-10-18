// Sonido propio de AulaViva: tres notas que suben, para reconocer los avisos de la plataforma.
// Lo genera el navegador con Web Audio, sin archivos. Suena con el panel abierto en alguna pestaña,
// aunque esté minimizado; con el navegador cerrado, la notificación usa el sonido del sistema.

const CLAVE = "aulaviva:sonido";
const NOTAS = [659.25, 783.99, 1046.5]; // mi, sol, do

let contexto: AudioContext | null = null;

export function sonidoActivado(): boolean {
  try {
    return localStorage.getItem(CLAVE) !== "no";
  } catch {
    return true;
  }
}

export function guardarSonido(activado: boolean): void {
  try {
    localStorage.setItem(CLAVE, activado ? "si" : "no");
  } catch {
    // sin almacenamiento: queda activado
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

export function sonar(urgente = false, forzar = false): void {
  if (!forzar && !sonidoActivado()) return;
  prepararSonido();
  if (!contexto) return;
  const inicio = contexto.currentTime + 0.02;
  const veces = urgente ? 2 : 1;
  for (let v = 0; v < veces; v++) {
    NOTAS.forEach((frecuencia, i) => {
      const t = inicio + v * 0.6 + i * 0.13;
      const osc = contexto!.createOscillator();
      const volumen = contexto!.createGain();
      osc.type = "sine";
      osc.frequency.value = frecuencia;
      volumen.gain.setValueAtTime(0, t);
      volumen.gain.linearRampToValueAtTime(0.25, t + 0.02);
      volumen.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(volumen).connect(contexto!.destination);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  }
}
