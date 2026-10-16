// Lector de QR dentro de la página, para docentes que no saben escanear con la cámara del celular.
// Se carga solo al tocar "Escanear QR". Usa el lector del navegador (BarcodeDetector) cuando existe
// y, si no (iPhone, celulares antiguos), la librería jsQR.
import { iconoSvg } from "../../shared/iconos";

interface Detector {
  detect(fuente: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: {
      new (o: { formats: string[] }): Detector;
      getSupportedFormats(): Promise<string[]>;
    };
  }
}

export class SinCamara extends Error {}

// Mensaje según por qué no abrió la cámara, para que el docente sepa qué hacer
function motivoSinCamara(e: unknown): string {
  const nombre = e instanceof DOMException ? e.name : "";
  if (nombre === "NotAllowedError" || nombre === "SecurityError") {
    return "El navegador no tiene permiso para usar la cámara. Toca el candado junto a la dirección, permite la cámara y vuelve a intentarlo, o elige tu aula de la lista.";
  }
  if (nombre === "NotFoundError" || nombre === "OverconstrainedError") {
    return "No encontramos una cámara en este equipo. Elige tu aula de la lista.";
  }
  if (nombre === "NotReadableError" || nombre === "AbortError") {
    return "Otra app está usando la cámara. Ciérrala y vuelve a intentarlo, o elige tu aula de la lista.";
  }
  return "No se pudo abrir la cámara. Elige tu aula de la lista.";
}

// El QR impreso lleva la dirección completa del aula: https://…/r/204
export function codigoDeQr(texto: string): string | null {
  try {
    const m = new URL(texto.trim(), location.href).pathname.match(/^\/r\/([\w-]+)\/?$/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

async function crearLector(): Promise<(video: HTMLVideoElement) => Promise<string | null>> {
  if (window.BarcodeDetector) {
    try {
      if ((await window.BarcodeDetector.getSupportedFormats()).includes("qr_code")) {
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
      }
    } catch {
      // Sigue con jsQR
    }
  }
  const { default: jsQR } = await import("jsqr");
  const lienzo = document.createElement("canvas");
  const ctx = lienzo.getContext("2d", { willReadFrequently: true })!;
  return async (video) => {
    // Imagen reducida: suficiente para leer el QR y mucho más rápido en celulares modestos
    const escala = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    lienzo.width = Math.round(video.videoWidth * escala);
    lienzo.height = Math.round(video.videoHeight * escala);
    ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height);
    const { data, width, height } = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
    return jsQR(data, width, height, { inversionAttempts: "dontInvert" })?.data ?? null;
  };
}

// Abre la cámara a pantalla completa. Devuelve el código del aula leído, o null si el docente cancela.
export async function escanearAula(): Promise<string | null> {
  if (!navigator.mediaDevices?.getUserMedia) throw new SinCamara("Este navegador no permite usar la cámara aquí. Elige tu aula de la lista.");

  const capa = document.createElement("div");
  capa.className = "escaner";
  capa.setAttribute("role", "dialog");
  capa.setAttribute("aria-modal", "true");
  capa.setAttribute("aria-label", "Escanear el QR del aula");
  capa.innerHTML = `
    <video class="escaner-video" playsinline muted autoplay></video>
    <div class="escaner-arriba"><p>Apunta al código QR<br />pegado en el aula</p></div>
    <div class="escaner-marco" aria-hidden="true"><i></i><i></i><i></i><i></i><span class="escaner-linea"></span></div>
    <div class="escaner-abajo">
      <p class="escaner-aviso" role="status">Abriendo la cámara…</p>
      <button type="button" class="escaner-cancelar">${iconoSvg("cerrar")}Cancelar</button>
    </div>`;
  document.body.append(capa);
  document.body.classList.add("con-escaner");
  const video = capa.querySelector("video")!;
  const aviso = capa.querySelector<HTMLElement>(".escaner-aviso")!;
  const cancelar = capa.querySelector<HTMLButtonElement>(".escaner-cancelar")!;
  cancelar.focus();

  let flujo: MediaStream | null = null;
  let activo = true;
  const cerrar = () => {
    activo = false;
    flujo?.getTracks().forEach((t) => t.stop());
    capa.remove();
    document.body.classList.remove("con-escaner");
  };

  return new Promise<string | null>((resolver, rechazar) => {
    const salir = (codigo: string | null) => {
      cerrar();
      document.removeEventListener("keydown", tecla);
      resolver(codigo);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && salir(null);
    document.addEventListener("keydown", tecla);
    cancelar.addEventListener("click", () => salir(null));

    (async () => {
      try {
        flujo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
          audio: false,
        });
      } catch (e) {
        cerrar();
        document.removeEventListener("keydown", tecla);
        return rechazar(new SinCamara(motivoSinCamara(e)));
      }
      if (!activo) return flujo.getTracks().forEach((t) => t.stop());
      video.srcObject = flujo;
      await video.play().catch(() => {});
      const leer = await crearLector();
      aviso.textContent = "Buscando el código…";

      let ajeno = 0;
      while (activo) {
        await new Promise((r) => setTimeout(r, 180));
        if (!activo || video.readyState < 2) continue;
        const texto = await leer(video).catch(() => null);
        if (!texto) continue;
        const codigo = codigoDeQr(texto);
        if (codigo) {
          navigator.vibrate?.(60);
          capa.classList.add("leido");
          aviso.textContent = /^\d/.test(codigo) ? `Aula ${codigo}` : codigo; // WL, SD: no son aulas
          await new Promise((r) => setTimeout(r, 350));
          return salir(codigo);
        }
        if (Date.now() - ajeno > 2500) {
          ajeno = Date.now();
          aviso.textContent = "Ese código no es de un aula. Busca el QR pegado en la pared del aula.";
        }
      }
    })();
  });
}
