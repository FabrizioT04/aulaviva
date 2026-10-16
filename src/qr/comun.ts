// Piezas compartidas por las páginas livianas del docente: la del QR del aula y su inicio.
import { iconoSvg } from "../../shared/iconos";

export function esc(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export const MARCA = `<span class="marca"><span class="logo-marca">${iconoSvg("pulso")}</span><strong>AulaViva</strong></span>`;

// Botón de tema: alterna claro y oscuro y lo recuerda en el celular.
// El HTML aplica el tema guardado antes de pintar; los estilos leen data-tema (ver vite.config.ts).
type Tema = "claro" | "oscuro";
const FONDO: Record<Tema, string> = { claro: "#f4f5f8", oscuro: "#0b0f14" };

function temaActual(): Tema {
  const t = document.documentElement.dataset.tema;
  if (t === "claro" || t === "oscuro") return t;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro";
}

export function botonTema(): string {
  const oscuro = temaActual() === "oscuro";
  return `<button type="button" class="boton-tema" id="boton-tema" aria-label="${oscuro ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}">${iconoSvg(oscuro ? "sol" : "luna")}</button>`;
}

export function activarBotonTema(app: HTMLElement) {
  app.addEventListener("click", (e) => {
    const boton = (e.target as HTMLElement).closest("#boton-tema");
    if (!boton) return;
    const nuevo: Tema = temaActual() === "oscuro" ? "claro" : "oscuro";
    document.documentElement.dataset.tema = nuevo;
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = FONDO[nuevo];
    try {
      localStorage.setItem("tema", nuevo);
    } catch {
      // Sin almacenamiento (modo privado): el tema dura hasta recargar
    }
    boton.outerHTML = botonTema();
    document.getElementById("boton-tema")?.focus();
  });
}
