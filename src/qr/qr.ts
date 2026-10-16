// Página que abre el docente al escanear el QR del aula.
// Sin React a propósito: pesa unos pocos KB y carga al instante con datos móviles.
import { iconoSvg } from "../../shared/iconos";
import type { EstadoAulaQr, TipoFalla } from "../../shared/tipos";
import { activarBotonTema, botonTema, esc, MARCA } from "./comun";
import "./qr.css";
import "./qr-efectos.css";

const TIPOS: [TipoFalla, string][] = [
  ["internet", "Internet"],
  ["proyector", "Proyector"],
  ["pc", "PC"],
  ["otro", "Otro"],
];
const ETIQUETA: Record<string, string> = Object.fromEntries(TIPOS);
const ESTADO: Record<string, string> = { abierto: "En cola", en_atencion: "En atención" };
// Lo que el docente ve del aula: "Operativa" confundía si algo fallaba y aún nadie lo había reportado
const SEMAFORO: Record<string, string> = {
  verde: "Sin reportes",
  amarillo: "Falla reportada",
  rojo: "Clase bloqueada",
};
// Ejemplo del detalle según la falla elegida
const EJEMPLO: Record<TipoFalla, string> = {
  internet: "Ej. no carga ninguna página en la laptop",
  proyector: "Ej. el proyector no detecta la laptop",
  pc: "Ej. la PC no enciende",
  otro: "Ej. el parlante no suena",
};

const app = document.getElementById("app")!;
const codigo = decodeURIComponent(location.pathname.split("/")[2] ?? "");
// Por dónde llegó el docente: /docente agrega ?via=lista o ?via=escaner; sin eso, escaneó el QR impreso
const via = new URLSearchParams(location.search).get("via");
const entrada = via === "lista" || via === "escaner" ? via : "qr";

function minutos(m: number | null): string | null {
  if (m == null) return null;
  const r = Math.max(1, Math.round(m));
  return r < 60 ? `${r} min` : `${Math.floor(r / 60)} h ${r % 60} min`;
}

// Reduce la foto en el celular antes de subirla: de ~4 MB a ~200 KB
async function comprimir(archivo: File): Promise<Blob> {
  const LADO_MAX = 1280;
  let imagen: CanvasImageSource & { width: number; height: number };
  try {
    imagen = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  } catch {
    imagen = await new Promise<HTMLImageElement>((ok, falla) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = falla;
      img.src = URL.createObjectURL(archivo);
    });
  }
  const escala = Math.min(1, LADO_MAX / Math.max(imagen.width, imagen.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(imagen.width * escala);
  lienzo.height = Math.round(imagen.height * escala);
  lienzo.getContext("2d")!.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  return new Promise((ok, falla) =>
    lienzo.toBlob((b) => (b ? ok(b) : falla(new Error("sin imagen"))), "image/jpeg", 0.72),
  );
}

activarBotonTema(app);

function mensaje(titulo: string, detalle = "") {
  app.innerHTML = `<header class="cabecera"><div class="cabecera-fila">${MARCA}${botonTema()}</div></header>
    <section class="tarjeta"><h2>${esc(titulo)}</h2>${detalle ? `<p>${esc(detalle)}</p>` : ""}</section>`;
}

async function cargar() {
  const res = await fetch(`/api/qr/${encodeURIComponent(codigo)}`);
  if (res.status === 401) {
    return mensaje("Inicia sesión con tu correo institucional", "Usa tu cuenta @innovaschools.edu.pe para reportar.");
  }
  if (!res.ok) {
    const { error } = (await res.json().catch(() => ({}))) as { error?: string };
    return mensaje("No se pudo abrir el aula", error ?? "Intenta escanear el QR de nuevo.");
  }
  pintar((await res.json()) as EstadoAulaQr);
}

function pintar(estado: EstadoAulaQr, aviso = "", enviado = false) {
  const { aula, abiertos, email } = estado;
  let tipo: TipoFalla | null = null;
  const fotos: Blob[] = [];
  const MAX_FOTOS = 3;

  const reportados = abiertos.length
    ? `<section class="tarjeta">
        <h2>${enviado ? "Reportes de esta aula" : "Ya reportado en esta aula"}</h2>
        <ul class="abiertos">${abiertos
          .map(
            (r) =>
              `<li><span class="tipo-icono ${r.tipo_falla}">${iconoSvg(r.tipo_falla)}</span><span class="abierto-texto"><strong>${ETIQUETA[r.tipo_falla]}</strong>${r.bloquea_clase ? ' <em class="insignia">Urgente</em>' : ""}</span><span class="estado-reporte ${r.estado}">${ESTADO[r.estado] ?? ""}</span></li>`,
          )
          .join("")}</ul>
        ${enviado ? "" : '<p class="suave">TI ya fue avisado. Solo reporta si es otra falla.</p>'}
      </section>`
    : "";

  app.innerHTML = `
    <header class="cabecera">
      <div class="cabecera-fila">
        ${MARCA}
        <span class="cabecera-acciones">
          <span class="estado ${aula.semaforo}"><i></i>${SEMAFORO[aula.semaforo]}</span>
          ${botonTema()}
        </span>
      </div>
      <div class="cabecera-aula">
        <div class="cabecera-texto">
          <p class="ubicacion">${[aula.piso != null && `Piso ${aula.piso}`, aula.pabellon && `Pabellón ${esc(aula.pabellon)}`, "Sede SMP1"].filter(Boolean).join(" · ")}</p>
          <h1>${esc(aula.nombre)}</h1>
          ${aula.seccion ? `<p class="seccion">${esc(aula.seccion)}${aula.nivel ? ` · ${esc(aula.nivel)}` : ""}</p>` : ""}
        </div>
        <div class="cubo-escena" aria-hidden="true"><div class="cubo ${aula.semaforo}">${esc(aula.codigo)}</div></div>
      </div>
    </header>
    ${aviso}
    ${reportados}
    <form id="form"${enviado ? " hidden" : ""}>
      <h2>¿Qué está fallando?</h2>
      <div class="opciones" id="tipos">${TIPOS.map(([v, e]) => `<button type="button" data-tipo="${v}" aria-pressed="false"><span class="ic">${iconoSvg(v)}</span>${e}</button>`).join("")}</div>
      <details class="extra" id="extra">
        <summary>${iconoSvg("registrar")}<span id="titulo-extra">Agregar detalle o foto (opcional)</span></summary>
        <label><span id="etiqueta-detalle">Detalle (opcional)</span><textarea id="detalle" rows="2" maxlength="500" placeholder="Ej. desde cuándo pasa o qué ya probaste"></textarea></label>
        <div class="foto">
          <span class="etiqueta-foto">Fotos (opcional, hasta 3)</span>
          <div class="vista-foto" id="vista"></div>
          <label class="boton-foto" id="elegir-foto">${iconoSvg("camara")}<span id="texto-foto">Tomar o elegir foto</span><input type="file" id="archivo" accept="image/*" multiple hidden /></label>
        </div>
      </details>
      <div class="acciones-reporte">
        <button type="button" class="enviar" data-bloquea="0" disabled>Avisar a TI</button>
        <button type="button" class="enviar boton-urgente" data-bloquea="1" disabled>${iconoSvg("alerta")}No puedo continuar mi clase</button>
      </div>
      <p class="aviso-elegir suave" id="aviso-elegir">Primero elige qué está fallando.</p>
      <p class="error" id="error" role="alert"></p>
    </form>
    <p class="pie">Reportando como ${esc(email)}</p>`;

  // Dos botones en vez de la pregunta "¿Te impide dar la clase?": el docente avisa en dos toques
  // y nunca queda marcado "no urgente" por no haber respondido
  const botones = [...document.querySelectorAll<HTMLButtonElement>(".acciones-reporte .enviar")];
  const textoOriginal = botones.map((b) => b.innerHTML);
  const extra = document.getElementById("extra") as HTMLDetailsElement;
  const detalleCampo = document.getElementById("detalle") as HTMLTextAreaElement;
  const error = document.getElementById("error")!;
  const archivo = document.getElementById("archivo") as HTMLInputElement;
  const vista = document.getElementById("vista")!;
  const elegir = document.getElementById("elegir-foto")!;
  const textoFoto = document.getElementById("texto-foto")!;
  let previas: string[] = [];

  function pintarFotos() {
    for (const u of previas) URL.revokeObjectURL(u);
    previas = fotos.map((f) => URL.createObjectURL(f));
    vista.innerHTML = previas
      .map(
        (u, i) =>
          `<div class="miniatura"><img src="${u}" alt="Foto ${i + 1}" /><button type="button" data-quitar="${i}" aria-label="Quitar foto ${i + 1}">✕</button></div>`,
      )
      .join("");
    elegir.hidden = fotos.length >= MAX_FOTOS;
    textoFoto.textContent = fotos.length ? `Agregar otra foto (${fotos.length}/${MAX_FOTOS})` : "Tomar o elegir foto";
  }

  archivo.addEventListener("change", async () => {
    const elegidos = [...(archivo.files ?? [])].slice(0, MAX_FOTOS - fotos.length);
    archivo.value = "";
    if (!elegidos.length) return;
    error.textContent = "";
    for (const elegido of elegidos) {
      try {
        fotos.push(await comprimir(elegido));
      } catch {
        error.textContent = "No se pudo leer una de las fotos. Prueba con otra.";
      }
    }
    pintarFotos();
  });

  vista.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-quitar]");
    if (!b) return;
    fotos.splice(Number(b.dataset.quitar), 1);
    pintarFotos();
  });

  document.getElementById("tipos")!.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    tipo = b.dataset.tipo as TipoFalla;
    for (const x of b.parentElement!.children) {
      x.classList.toggle("activo", x === b);
      x.setAttribute("aria-pressed", String(x === b));
    }
    for (const x of botones) x.disabled = false;
    document.getElementById("aviso-elegir")!.hidden = true;
    // En "Otro" TI necesita saber qué pasa: el detalle se abre y es obligatorio
    const otro = tipo === "otro";
    document.getElementById("etiqueta-detalle")!.textContent = otro ? "Describe la falla" : "Detalle (opcional)";
    document.getElementById("titulo-extra")!.textContent = otro ? "Describe la falla" : "Agregar detalle o foto (opcional)";
    detalleCampo.placeholder = EJEMPLO[tipo];
    if (otro) extra.open = true;
  });

  const form = document.getElementById("form") as HTMLFormElement;
  form.addEventListener("submit", (e) => e.preventDefault());
  // Tras enviar, el formulario queda oculto para que la confirmación sea lo único pendiente de leer
  document.getElementById("otra-falla")?.addEventListener("click", (e) => {
    (e.currentTarget as HTMLElement).hidden = true;
    form.hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  for (const boton of botones) boton.addEventListener("click", () => enviarReporte(boton));

  async function enviarReporte(boton: HTMLButtonElement) {
    if (!tipo) return;
    const bloquea = boton.dataset.bloquea === "1";
    const detalle = detalleCampo.value.trim();
    if (tipo === "otro" && !detalle) {
      error.textContent = "Escribe en pocas palabras qué está fallando.";
      extra.open = true;
      detalleCampo.focus();
      return;
    }
    const restaurar = () => botones.forEach((b, i) => ((b.disabled = false), (b.innerHTML = textoOriginal[i])));
    for (const b of botones) b.disabled = true;
    boton.textContent = "Enviando…";
    error.textContent = "";
    const res = await fetch(`/api/qr/${encodeURIComponent(codigo)}/reportes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo_falla: tipo, bloquea_clase: bloquea, descripcion: detalle, entrada }),
    }).catch(() => null);

    if (!res?.ok) {
      const { error: msg } = ((await res?.json().catch(() => ({}))) ?? {}) as { error?: string };
      error.textContent = msg ?? "No se pudo enviar. Revisa tu conexión e intenta de nuevo.";
      restaurar();
      return;
    }

    const { id } = (await res.json().catch(() => ({}))) as { id?: number };

    // Las fotos se suben una por una después de crear el reporte: si alguna falla, el reporte ya llegó
    let fotosFallidas = id ? 0 : fotos.length;
    if (fotos.length && id) {
      for (const [i, foto] of fotos.entries()) {
        boton.textContent = fotos.length > 1 ? `Subiendo foto ${i + 1} de ${fotos.length}…` : "Subiendo foto…";
        const subida = await fetch(`/api/qr/${encodeURIComponent(codigo)}/reportes/${id}/foto`, {
          method: "PUT",
          headers: { "Content-Type": "image/jpeg" },
          body: foto,
        }).catch(() => null);
        if (!subida?.ok) fotosFallidas++;
      }
    }

    const espera = bloquea ? minutos(estado.prom_atencion_urgente_min) : null;
    const confirmacion = `<section class="tarjeta exito">
        <h2><span class="check">${iconoSvg("check")}</span>Listo, ya avisamos a TI</h2>
        ${id ? `<p class="numero-reporte">Reporte N.º <strong>${id}</strong></p>` : ""}
        <p>No hace falta avisar también por WhatsApp. ${
          espera
            ? `En casos urgentes, TI suele llegar en unos <strong>${espera}</strong>.`
            : "Te atenderán lo antes posible."
        }</p>${
          fotosFallidas
            ? `<p class="suave">El reporte llegó, pero ${fotosFallidas === 1 ? "una foto no se pudo subir" : `${fotosFallidas} fotos no se pudieron subir`}.</p>`
            : ""
        }
        <a class="enviar boton-listo" href="/docente">Entendido</a>
        <button type="button" class="enlace-otra" id="otra-falla">Reportar otra falla en esta aula</button>
      </section>`;
    const nuevo = await fetch(`/api/qr/${encodeURIComponent(codigo)}`).then((r) => (r.ok ? r.json() : null));
    pintar((nuevo as EstadoAulaQr) ?? estado, confirmacion, true);
    scrollTo(0, 0);
  }
}

cargar().catch(() => mensaje("Sin conexión", "Revisa tu internet e intenta de nuevo."));
