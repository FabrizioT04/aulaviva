// Inicio del docente (/docente): escanear el QR del aula desde la misma página,
// sin saber usar la cámara del celular, o elegir el aula de una lista.
// Liviana como la página del QR: el lector se descarga solo al tocar "Escanear".
import { ACCIONES_DOCENTE, PLATAFORMAS } from "../../shared/cuentas";
import { iconoSvg } from "../../shared/iconos";
import type { AulaConEstado, AulasDocente } from "../../shared/tipos";
import { activarBotonTema, botonTema, esc, filaMiReporte, MARCA } from "./comun";
import "./qr.css";
import "./qr-efectos.css";
import "./docente.css";

const app = document.getElementById("app")!;
activarBotonTema(app);

const SEMAFORO: Record<string, string> = { verde: "sin reportes", amarillo: "falla reportada", rojo: "clase bloqueada" };

// Chrome en Android avisa cuando la página se puede instalar como app
let instalar: (Event & { prompt(): Promise<void> }) | null = null;
addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  instalar = e as typeof instalar;
  pintarInstalar();
});
const instalada = () => matchMedia("(display-mode: standalone)").matches || "standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true;

// Pisos que el docente dejó abiertos: suele reportar siempre desde el mismo, así que se recuerdan
const pisosAbiertos = new Set<string>(leerPisos());
function leerPisos(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem("pisos-abiertos") ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function guardarPisos() {
  try {
    localStorage.setItem("pisos-abiertos", JSON.stringify([...pisosAbiertos]));
  } catch {
    /* sin almacenamiento: solo dura esta visita */
  }
}

function normalizar(t: string): string {
  return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "");
}

// Los ambientes especiales tienen siglas en vez de grado: el buscador también entiende su nombre
const AMBIENTES: Record<string, string> = {
  ML: "MediaLab, media lab",
  LC: "Laboratorio de Ciencias, laboratorio ciencias",
};
const nombreAmbiente = (seccion: string | null) =>
  (seccion ?? "")
    .split("/")
    .map((s) => AMBIENTES[s.trim().toUpperCase()] ?? "")
    .join(" ");

function botonAula(a: AulaConEstado): string {
  const ambiente = AMBIENTES[(a.seccion ?? "").toUpperCase()]?.split(",")[0];
  const nombre = `${a.nombre}${a.seccion ? `, ${ambiente ?? a.seccion}` : ""}, ${SEMAFORO[a.semaforo]}`;
  return `<a class="aula-item ${a.semaforo}" href="/r/${encodeURIComponent(a.codigo)}?via=lista" aria-label="${esc(nombre)}" data-buscar="${esc(normalizar(`${a.codigo} ${a.seccion ?? ""} ${a.nombre} ${a.nivel ?? ""} ${a.pabellon ? `pabellón ${a.pabellon}` : ""} ${nombreAmbiente(a.seccion)}`))}">
    <strong>${esc(a.codigo)}</strong>${a.seccion ? `<span>${esc(a.seccion)}</span>` : ""}<i aria-hidden="true"></i></a>`;
}

function pintarInstalar() {
  const caja = document.getElementById("instalar");
  if (!caja || instalada()) return;
  const iphone = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const ayuda = instalar
    ? ""
    : iphone
      ? "En Safari toca <strong>Compartir</strong> y luego <strong>Agregar a inicio</strong>."
      : "En el menú del navegador (⋮) toca <strong>Agregar a la pantalla principal</strong>.";
  caja.innerHTML = `<section class="tarjeta instalar">
      <span class="ic">${iconoSvg("celular")}</span>
      <div><h2>Tenlo a un toque</h2><p>Agrega esta página a la pantalla de tu celular y ábrela como una app.${ayuda ? ` ${ayuda}` : ""}</p>
      ${instalar ? `<button type="button" class="boton-secundario" id="boton-instalar">Agregar a mi celular</button>` : ""}</div>
    </section>`;
  document.getElementById("boton-instalar")?.addEventListener("click", async () => {
    await instalar?.prompt();
    instalar = null;
    caja.innerHTML = "";
  });
}

// Lo que el docente reportó hace poco y en qué va: así no tiene que preguntar por WhatsApp.
// Va plegado, con solo el título y cuántos faltan, para no tapar el botón de escanear ni la lista de aulas.
// Los sin resolver van primero.
function misReportes(datos: AulasDocente | null, abierto = false): string {
  if (!datos?.mios.length) return "";
  const orden = [...datos.mios].sort((a, b) => Number(a.estado === "resuelto") - Number(b.estado === "resuelto"));
  const pendientes = orden.filter((m) => m.estado !== "resuelto").length;
  return `<details class="tarjeta mis-reportes"${abierto ? " open" : ""}>
      <summary>
        <span class="mis-reportes-titulo"><strong>Tus reportes</strong>
          <small class="${pendientes ? "" : "todo-resuelto"}">${pendientes ? `${pendientes} sin resolver · TI ya está avisado` : "Todo lo que reportaste ya se resolvió"}</small></span>
        ${iconoSvg("abajo")}
      </summary>
      <ul class="abiertos">${orden.map((m) => filaMiReporte(m)).join("")}</ul>
    </details>`;
}

// Problema con su cuenta o la de un estudiante (Classroom, Pearson, el correo…): le llega a TI como aviso,
// TI lo atiende y el docente lo ve resuelto en "Tus reportes". Va plegado: lo de todos los días es el aula.
const chips = (campo: string, opciones: Record<string, string>) =>
  `<div class="chips-cuenta" data-campo="${campo}">${Object.entries(opciones)
    .map(([valor, etiqueta]) => `<button type="button" data-valor="${valor}" aria-pressed="false">${esc(etiqueta)}</button>`)
    .join("")}</div>`;

function formularioCuenta(): string {
  return `<form id="form-cuenta" novalidate>
      <fieldset><legend>¿Qué pasa?</legend>${chips("accion", ACCIONES_DOCENTE)}</fieldset>
      <fieldset><legend>¿En qué plataforma?</legend>${chips("plataforma", PLATAFORMAS)}</fieldset>
      <fieldset><legend>¿De quién es la cuenta?</legend>${chips("para", { yo: "Mía", estudiante: "De un estudiante" })}</fieldset>
      <label id="campo-estudiante" hidden>Nombre y sección del estudiante
        <input name="detalle" maxlength="120" autocomplete="off" placeholder="Ej. Ana Torres, 5A" /></label>
      <label><span>Cuéntale a TI <span class="opcional" id="opcional-cuenta">(opcional)</span></span>
        <textarea name="descripcion" rows="2" maxlength="500" placeholder="Ej. no le llega el código para entrar"></textarea></label>
      <p class="nota-clave">${iconoSvg("info")}<span>Nunca escribas tu clave ni la del estudiante. TI te contacta si hace falta.</span></p>
      <button type="submit" class="enviar">Enviar a TI</button>
      <p class="error" id="error-cuenta" role="alert"></p>
    </form>`;
}

function seccionCuenta(): string {
  return `<details class="tarjeta pedido-cuenta" id="pedido-cuenta">
      <summary>
        <span class="tipo-icono cuenta">${iconoSvg("cuenta")}</span>
        <span class="mis-reportes-titulo"><strong>¿Problema con tu cuenta o una plataforma?</strong>
          <small>Clave del correo, Classroom, Pearson, ALEKS…</small></span>
        ${iconoSvg("abajo")}
      </summary>
      <div id="cuerpo-cuenta">${formularioCuenta()}</div>
    </details>`;
}

function activarCuenta() {
  const cuerpo = document.getElementById("cuerpo-cuenta")!;
  const form = cuerpo.querySelector<HTMLFormElement>("#form-cuenta")!;
  const elegido: Record<string, string> = {};
  const error = form.querySelector<HTMLElement>("#error-cuenta")!;
  const detalle = form.querySelector<HTMLInputElement>('[name="detalle"]')!;
  const descripcion = form.querySelector<HTMLTextAreaElement>('[name="descripcion"]')!;
  // "Otro problema" u "Otra plataforma" no dicen nada solos: ahí el detalle es obligatorio
  const pideDetalle = () => elegido.accion === "otro" || elegido.plataforma === "otra";

  for (const grupo of form.querySelectorAll<HTMLElement>(".chips-cuenta")) {
    grupo.addEventListener("click", (e) => {
      const boton = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-valor]");
      if (!boton) return;
      elegido[grupo.dataset.campo!] = boton.dataset.valor!;
      for (const b of grupo.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b === boton));
      document.getElementById("campo-estudiante")!.hidden = elegido.para !== "estudiante";
      document.getElementById("opcional-cuenta")!.hidden = pideDetalle();
      error.textContent = "";
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    // Lo primero que falta, con el campo donde se arregla
    const primero = (campo: string) => form.querySelector<HTMLElement>(`[data-campo="${campo}"] button`);
    const falta = (
      [
        [!elegido.accion, "Elige qué pasa", primero("accion")],
        [!elegido.plataforma, "Elige la plataforma", primero("plataforma")],
        [!elegido.para, "Elige de quién es la cuenta", primero("para")],
        [elegido.para === "estudiante" && !detalle.value.trim(), "Escribe el nombre y la sección del estudiante", detalle],
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
      const res = await fetch("/api/qr/cuentas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...elegido, detalle: detalle.value, descripcion: descripcion.value }),
      });
      const r = (await res.json().catch(() => ({}))) as { error?: string; ya_enviado?: boolean };
      if (!res.ok) throw new Error(r.error ?? "No se pudo enviar. Intenta de nuevo.");
      cuerpo.innerHTML = `<div class="enviado-cuenta">
          <span class="check">${iconoSvg("check")}</span>
          <div><strong>${r.ya_enviado ? "Ya lo habías enviado" : "Listo, TI ya recibió tu pedido"}</strong>
          <p>Lo ves en "Tus reportes" y cambia a Resuelto cuando TI lo atienda.</p></div>
        </div>
        <button type="button" class="enlace-otra" id="otro-pedido">Enviar otro pedido</button>`;
      document.getElementById("otro-pedido")!.addEventListener("click", () => {
        cuerpo.innerHTML = formularioCuenta();
        activarCuenta();
      });
      actualizarMisReportes();
    } catch (err) {
      error.textContent = err instanceof Error && !(err instanceof TypeError) ? err.message : "No se pudo enviar. Revisa tu internet.";
      enviar.disabled = false;
      enviar.textContent = "Enviar a TI";
    }
  });
}

function pintar(datos: AulasDocente | null, error = "") {
  const pisos = new Map<string, AulaConEstado[]>();
  for (const a of datos?.aulas ?? []) {
    const piso = a.piso != null ? `Piso ${a.piso}` : "Otras";
    pisos.set(piso, [...(pisos.get(piso) ?? []), a]);
  }
  const lista = [...pisos]
    .sort(([x], [y]) => y.localeCompare(x))
    .map(([piso, aulas]) => {
      const conReporte = aulas.filter((a) => a.semaforo !== "verde").length;
      const info = `${aulas.length} ${aulas.length === 1 ? "aula" : "aulas"}${conReporte ? ` · ${conReporte} con reporte` : ""}`;
      return `<details class="grupo-piso" data-piso="${esc(piso)}"${pisosAbiertos.has(piso) ? " open" : ""}>
        <summary><span class="piso-nombre">${piso}</span><span class="piso-info" data-total="${esc(info)}">${info}</span>${iconoSvg("abajo")}</summary>
        <div class="aulas-docente">${aulas.map(botonAula).join("")}</div></details>`;
    })
    .join("");

  app.innerHTML = `
    <header class="cabecera">
      <div class="cabecera-fila">${MARCA}${botonTema()}</div>
      <p class="ubicacion">Sede SMP1</p>
      <h1 class="titulo-inicio">¿Algo falla en tu aula?</h1>
      <p class="bajada">Avisa a TI en menos de un minuto.</p>
    </header>
    <button type="button" class="escanear" id="escanear">
      <span class="escanear-ic">${iconoSvg("qr")}</span>
      <span class="escanear-texto"><strong>Escanear QR del aula</strong><small>Lo más rápido: apunta al QR del aula</small></span>
    </button>
    <p class="error" id="error-camara" role="alert"></p>
    ${misReportes(datos)}
    <section class="tarjeta elegir">
      <h2>¿No puedes escanear? Elige tu aula</h2>
      <label class="buscar">${iconoSvg("buscar")}<input id="buscar" type="search" inputmode="search" autocomplete="off" placeholder="Ej. 204, 4A o primaria" aria-label="Buscar aula por número, sección, nivel o pabellón" /></label>
      <p class="leyenda" aria-hidden="true"><span><i class="verde"></i>Sin reportes</span><span><i class="amarillo"></i>Falla reportada</span><span><i class="rojo"></i>Clase bloqueada</span></p>
      <p class="conteo" id="conteo" aria-live="polite"></p>
      <div id="lista">${lista || `<p class="suave">${esc(error || "No hay aulas para mostrar.")}</p>`}</div>
      <p class="suave" id="sin-resultados" hidden>No hay un aula con ese número, sección o nivel.</p>
    </section>
    ${datos ? seccionCuenta() : ""}
    <div id="instalar"></div>
    ${datos ? `<p class="pie">Conectado como ${esc(datos.email)}</p>` : ""}`;

  pintarInstalar();
  if (datos) activarCuenta();

  const buscar = document.getElementById("buscar") as HTMLInputElement;
  buscar.addEventListener("input", () => {
    const q = normalizar(buscar.value);
    let visibles = 0;
    for (const grupo of app.querySelectorAll<HTMLDetailsElement>("[data-piso]")) {
      let enGrupo = 0;
      for (const a of grupo.querySelectorAll<HTMLElement>(".aula-item")) {
        const ve = !q || a.dataset.buscar!.includes(q);
        a.hidden = !ve;
        if (ve) enGrupo++;
      }
      grupo.hidden = enGrupo === 0;
      // Al buscar se abren los pisos con resultados; al borrar vuelven como el docente los dejó
      grupo.open = q ? enGrupo > 0 : pisosAbiertos.has(grupo.dataset.piso!);
      // Mientras busca, el encabezado cuenta las coincidencias del piso, no todas sus aulas
      const info = grupo.querySelector<HTMLElement>(".piso-info")!;
      info.textContent = q ? `${enGrupo} ${enGrupo === 1 ? "coincidencia" : "coincidencias"}` : info.dataset.total!;
      visibles += enGrupo;
    }
    document.getElementById("sin-resultados")!.hidden = visibles > 0 || !datos?.aulas.length;
    // Con varias coincidencias, el conteo ayuda a notar que hay que elegir por piso y sección
    document.getElementById("conteo")!.textContent = q && visibles ? (visibles === 1 ? "1 aula coincide" : `${visibles} aulas coinciden`) : "";
  });

  for (const s of app.querySelectorAll<HTMLElement>(".grupo-piso summary")) {
    s.addEventListener("click", () => {
      if (normalizar(buscar.value)) return;
      const piso = (s.parentElement as HTMLDetailsElement).dataset.piso!;
      // El click llega antes de que cambie "open": si estaba abierto, se está cerrando
      if ((s.parentElement as HTMLDetailsElement).open) pisosAbiertos.delete(piso);
      else pisosAbiertos.add(piso);
      guardarPisos();
    });
  }

  const boton = document.getElementById("escanear") as HTMLButtonElement;
  const errorCamara = document.getElementById("error-camara")!;
  boton.addEventListener("click", async () => {
    errorCamara.textContent = "";
    boton.disabled = true;
    try {
      const { escanearAula } = await import("./escaner");
      const codigo = await escanearAula();
      if (codigo) return location.assign(`/r/${encodeURIComponent(codigo)}?via=escaner`);
    } catch (e) {
      errorCamara.textContent = e instanceof Error && e.name !== "TypeError" ? e.message : "No se pudo abrir la cámara. Elige tu aula de la lista.";
      document.getElementById("buscar")?.focus();
    }
    boton.disabled = false;
    boton.focus();
  });
}

async function cargar() {
  pintar(null, "Cargando aulas…");
  const res = await fetch("/api/qr").catch(() => null);
  if (res?.status === 401) return pintar(null, "Inicia sesión con tu correo @innovaschools.edu.pe para ver las aulas.");
  if (!res?.ok) return pintar(null, "No se pudieron cargar las aulas. Revisa tu internet, o escanea el QR.");
  pintar((await res.json()) as AulasDocente);
}

cargar();

// Vuelve a pedir "Tus reportes" sin repintar la página
function actualizarMisReportes() {
  fetch("/api/qr")
    .then((res) => (res.ok ? (res.json() as Promise<AulasDocente>) : null))
    .then((datos) => {
      const caja = app.querySelector<HTMLDetailsElement>(".mis-reportes");
      // Si el docente lo dejó abierto, sigue abierto
      const nueva = datos && misReportes(datos, caja?.open);
      if (caja && nueva) caja.outerHTML = nueva;
      else if (caja && !nueva) caja.remove();
      else if (!caja && nueva) document.getElementById("error-camara")?.insertAdjacentHTML("afterend", nueva);
    })
    .catch(() => null);
}

// Al volver a la app (por ejemplo, después de que TI atendió), se pone al día sola
addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") actualizarMisReportes();
});
