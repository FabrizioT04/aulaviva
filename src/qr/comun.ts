// Piezas compartidas por las páginas livianas del docente: la del QR del aula y su inicio.
import { iconoSvg, type NombreIcono } from "../../shared/iconos";
import { DRAGON_AULAVIVA } from "../../shared/marca";
import { TIPOS_FALLA, type EstadoMiReporte, type MiReporte, type TipoFalla } from "../../shared/tipos";

export function esc(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export const MARCA = `<span class="marca"><span class="logo-marca">${DRAGON_AULAVIVA}</span><strong>AulaViva</strong></span>`;

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

// Estado de los reportes en palabras del docente (fallas y daños usan los mismos)
export const ESTADO_DOCENTE: Record<EstadoMiReporte, string> = {
  recibido: "Recibido",
  en_atencion: "En atención",
  escalado: "Escalado",
  resuelto: "Resuelto",
};

export function haceCuanto(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

const iconoDe = (m: MiReporte): NombreIcono =>
  m.clase === "cuenta" ? "cuenta" : m.clase === "reporte" && TIPOS_FALLA.includes(m.tipo as TipoFalla) ? (m.tipo as TipoFalla) : "dano";

// Una fila por reporte del docente: qué, dónde (o de quién es la cuenta), cuándo y en qué va
export function filaMiReporte(m: MiReporte, conAula = true): string {
  const cuando = m.estado === "resuelto" && m.resuelto_en ? `Resuelto ${haceCuanto(m.resuelto_en)}` : `Enviado ${haceCuanto(m.reportado_en)}`;
  return `<li class="mi-reporte ${m.estado}">
    <span class="tipo-icono ${m.clase === "reporte" ? esc(m.tipo) : m.clase}">${iconoSvg(iconoDe(m))}</span>
    <span class="abierto-texto"><strong>${esc(m.titulo)}</strong><small>${conAula ? `${esc(m.aula_nombre)} · ` : ""}${cuando}</small></span>
    <span class="estado-reporte ${m.estado}">${m.estado === "resuelto" ? iconoSvg("check") : ""}${ESTADO_DOCENTE[m.estado]}</span>
  </li>`;
}
