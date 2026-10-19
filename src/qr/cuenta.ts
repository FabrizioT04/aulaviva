// Pedido de cuenta o plataforma, desde la página del QR de los laboratorios ML: es donde los estudiantes usan
// Khan Academy, Pearson, ALEKS… Casi siempre es la cuenta de un estudiante; a veces, la del docente.
// Le llega a TI como aviso, TI lo atiende desde Registrar y el docente lo ve resuelto en "Tus reportes".
import { ACCIONES_DOCENTE, PLATAFORMAS } from "../../shared/cuentas";
import { iconoSvg } from "../../shared/iconos";
import { esc } from "./comun";
import "./cuenta.css";

const chips = (campo: string, opciones: Record<string, string>, elegido?: string) =>
  `<div class="chips-cuenta" data-campo="${campo}">${Object.entries(opciones)
    .map(([valor, etiqueta]) => `<button type="button" data-valor="${valor}" aria-pressed="${valor === elegido}">${esc(etiqueta)}</button>`)
    .join("")}</div>`;

// De quién es la cuenta: "uno" y "varios" se envían como para = "estudiante"
const DE_QUIEN = { uno: "Un estudiante", varios: "Varios estudiantes", yo: "Mía" };

export function formularioCuenta(): string {
  return `<form id="form-cuenta" novalidate>
      <fieldset><legend>¿De quién es la cuenta?</legend>${chips("quien", DE_QUIEN, "uno")}</fieldset>
      <fieldset><legend>¿Qué pasa?</legend>${chips("accion", ACCIONES_DOCENTE)}</fieldset>
      <fieldset><legend>¿En qué plataforma?</legend>${chips("plataforma", PLATAFORMAS)}</fieldset>
      <label id="campo-cuantos" hidden>¿Cuántos estudiantes?
        <input name="cantidad" type="number" inputmode="numeric" min="2" max="60" value="2" /></label>
      <label id="campo-estudiante"><span id="etiqueta-estudiante">Sección y nombre del estudiante</span>
        <textarea name="detalle" rows="2" maxlength="300" autocomplete="off" placeholder="Ej. 5A, Ana Torres"></textarea></label>
      <label><span>Cuéntale a TI <span class="opcional" id="opcional-cuenta">(opcional)</span></span>
        <textarea name="descripcion" rows="2" maxlength="500" placeholder="Ej. no le llega el código para entrar"></textarea></label>
      <p class="nota-clave">${iconoSvg("info")}<span>Nunca escribas tu clave ni la del estudiante. TI te contacta si hace falta.</span></p>
      <button type="submit" class="enviar">Enviar a TI</button>
      <p class="error" id="error-cuenta" role="alert"></p>
    </form>`;
}

export function activarCuenta(form: HTMLFormElement, ruta: string, alEnviar: (r: { ya_enviado?: boolean }) => void) {
  const elegido: Record<string, string> = { quien: "uno" };
  const error = form.querySelector<HTMLElement>("#error-cuenta")!;
  const detalle = form.querySelector<HTMLTextAreaElement>('[name="detalle"]')!;
  const descripcion = form.querySelector<HTMLTextAreaElement>('[name="descripcion"]')!;
  const cantidad = form.querySelector<HTMLInputElement>('[name="cantidad"]')!;
  const etiquetaEstudiante = form.querySelector<HTMLElement>("#etiqueta-estudiante")!;
  const varios = () => elegido.quien === "varios";
  // "Otro problema" u "Otra plataforma" no dicen nada solos: ahí el detalle es obligatorio
  const pideDetalle = () => elegido.accion === "otro" || elegido.plataforma === "otra";

  for (const grupo of form.querySelectorAll<HTMLElement>(".chips-cuenta")) {
    grupo.addEventListener("click", (e) => {
      const boton = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-valor]");
      if (!boton) return;
      elegido[grupo.dataset.campo!] = boton.dataset.valor!;
      for (const b of grupo.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b === boton));
      form.querySelector<HTMLElement>("#campo-estudiante")!.hidden = elegido.quien === "yo";
      form.querySelector<HTMLElement>("#campo-cuantos")!.hidden = !varios();
      etiquetaEstudiante.textContent = varios() ? "Sección y nombres" : "Sección y nombre del estudiante";
      detalle.placeholder = varios() ? "Ej. 4B: Luis Paredes, Ana Torres y Diego Ramos" : "Ej. 5A, Ana Torres";
      form.querySelector<HTMLElement>("#opcional-cuenta")!.hidden = pideDetalle();
      error.textContent = "";
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    // Lo primero que falta, con el campo donde se arregla
    const primero = (campo: string) => form.querySelector<HTMLElement>(`[data-campo="${campo}"] button`);
    const n = Number(cantidad.value);
    const falta = (
      [
        [!elegido.accion, "Elige qué pasa", primero("accion")],
        [!elegido.plataforma, "Elige la plataforma", primero("plataforma")],
        [varios() && !(Number.isInteger(n) && n >= 2 && n <= 60), "Escribe cuántos estudiantes son (de 2 a 60)", cantidad],
        [elegido.quien !== "yo" && !detalle.value.trim(), varios() ? "Escribe la sección y los nombres" : "Escribe la sección y el nombre del estudiante", detalle],
        [pideDetalle() && !descripcion.value.trim(), "Cuéntale a TI qué pasa", descripcion],
      ] as const
    ).find(([falla]) => falla);
    if (falta) {
      error.textContent = falta[1];
      falta[2]?.focus();
      return;
    }
    const enviar = form.querySelector<HTMLButtonElement>(".enviar")!;
    enviar.disabled = true;
    enviar.textContent = "Enviando…";
    error.textContent = "";
    try {
      const res = await fetch(ruta, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: elegido.accion,
          plataforma: elegido.plataforma,
          para: elegido.quien === "yo" ? "yo" : "estudiante",
          cantidad: varios() ? n : 1,
          detalle: detalle.value,
          descripcion: descripcion.value,
        }),
      });
      const r = (await res.json().catch(() => ({}))) as { error?: string; ya_enviado?: boolean };
      if (!res.ok) throw new Error(r.error ?? "No se pudo enviar. Intenta de nuevo.");
      alEnviar(r);
    } catch (err) {
      error.textContent = err instanceof Error && !(err instanceof TypeError) ? err.message : "No se pudo enviar. Revisa tu internet.";
      enviar.disabled = false;
      enviar.textContent = "Enviar a TI";
    }
  });
}
