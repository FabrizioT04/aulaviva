// Página que abre el docente al escanear el QR del aula.
// Sin React a propósito: pesa unos pocos KB y carga al instante con datos móviles.
import { iconoSvg } from "../../shared/iconos";
import { etiquetaFalla, fallasDe, TIPOS_FALLA } from "../../shared/tipos";
import { sugerirTipo } from "../../shared/sugerencia";
import { borrarBorrador, guardarBorrador, leerBorrador } from "../borrador";
import { comprimir } from "../comprimir";
import { ATIENDE_DANO, DESTINO_DANO, EQUIPO_DANOS, ETIQUETA_ATIENDE, GRUPO_DANO, seccionesDe, TIPOS_DANO, tiposDe } from "../../shared/danos";
import type { GrupoDano, TipoDano } from "../../shared/danos";
import type { EstadoAulaQr, GuiaDocente, TipoFalla } from "../../shared/tipos";
import { activarBotonTema, botonTema, esc, MARCA } from "./comun";
import "./qr.css";
import "./qr-efectos.css";

const ESTADO: Record<string, string> = { abierto: "En cola", en_atencion: "En atención", escalado: "Escalado" };
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
  pc: "Ej. no enciende o se queda congelada",
  otro: "Ej. la pizarra digital no responde al tacto",
  audio: "Ej. los parlantes no suenan con la laptop",
  impresora: "Ej. la impresora no imprime o se atasca el papel",
  perifericos: "Ej. el mouse o el teclado no responden",
  ecran: "Ej. el ecran no baja o se quedó a medias",
};

const app = document.getElementById("app")!;
const codigo = decodeURIComponent(location.pathname.split("/")[2] ?? "");
const CLAVE_BORRADOR = `aulaviva:borrador-qr:${codigo}`;
// Un reporte a medio llenar sirve durante la clase; pasada una hora la falla puede ser otra
const VIGENCIA_BORRADOR_MIN = 60;
interface BorradorQr {
  tipo: TipoFalla | null;
  detalle: string;
  fotos: number;
}
// El aviso de daño a medio llenar se guarda aparte, con la misma vigencia
const CLAVE_BORRADOR_DANO = `aulaviva:borrador-dano:${codigo}`;
interface BorradorDano {
  grupo: GrupoDano | null;
  tipo: TipoDano | null;
  equipo: string;
  seccion: string;
  estudiante: string;
  detalle: string;
  fotos: number;
}
// Por dónde llegó el docente: /docente agrega ?via=lista o ?via=escaner; sin eso, escaneó el QR impreso
const via = new URLSearchParams(location.search).get("via");
const entrada = via === "lista" || via === "escaner" ? via : "qr";

function minutos(m: number | null): string | null {
  if (m == null) return null;
  const r = Math.max(1, Math.round(m));
  return r < 60 ? `${r} min` : `${Math.floor(r / 60)} h ${r % 60} min`;
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
  const estado = (await res.json()) as EstadoAulaQr;
  // Si dejó un aviso de daño a medio llenar, vuelve directo a ese formulario
  if (leerBorrador<BorradorDano>(CLAVE_BORRADOR_DANO, VIGENCIA_BORRADOR_MIN)) pintarDano(estado);
  else pintar(estado);
}

// Cabecera con el aula y su semáforo; la comparten el reporte a TI y el de daños
function cabecera(aula: EstadoAulaQr["aula"]): string {
  return `
    <header class="cabecera">
      <div class="cabecera-fila">
        ${MARCA}
        <span class="cabecera-acciones">
          <span class="estado ${aula.semaforo}"><i></i>${aula.semaforo === "rojo" && !aula.clases ? "Falla urgente" : SEMAFORO[aula.semaforo]}</span>
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
      <a class="cambiar-aula" href="/docente">${iconoSvg("ubicacion")}¿No es tu aula? Cambiar de aula</a>
    </header>`;
}

function pintar(estado: EstadoAulaQr, aviso = "", enviado = false) {
  const avisoPrevio = aviso;
  const { aula, abiertos, email } = estado;
  // "Laptop" en las aulas, "Computadora" donde hay All in One
  const ETIQUETA = Object.fromEntries(TIPOS_FALLA.map((t) => [t, etiquetaFalla(t, aula.equipo)])) as Record<TipoFalla, string>;
  // Solo lo que hay en este ambiente: sin proyector donde no hay clases, impresora solo donde la hay
  const fallas = fallasDe(aula);
  const principales = fallas.slice(0, 4);
  let tipo: TipoFalla | null = null;
  const fotos: Blob[] = [];
  const MAX_FOTOS = 3;

  const reportados = abiertos.length
    ? `<section class="tarjeta">
        <h2>${enviado ? "Reportes de esta aula" : "Ya reportado en esta aula"}</h2>
        <ul class="abiertos">${abiertos
          .map(
            (r) =>
              `<li data-tipo="${r.tipo_falla}"><span class="tipo-icono ${r.tipo_falla}">${iconoSvg(r.tipo_falla)}</span><span class="abierto-texto"><strong>${ETIQUETA[r.tipo_falla]}</strong>${r.bloquea_clase ? ' <em class="insignia">Urgente</em>' : ""}</span><span class="estado-reporte ${r.estado}">${ESTADO[r.estado] ?? ""}</span></li>`,
          )
          .join("")}</ul>
        ${enviado ? "" : '<p class="suave">TI ya fue avisado. Solo reporta si es otra falla.</p>'}
      </section>`
    : "";

  app.innerHTML = `
    ${cabecera(aula)}
    ${aviso}
    ${reportados}
    <form id="form"${enviado ? " hidden" : ""}>
      <div class="borrador-recuperado" id="borrador" role="status" hidden></div>
      <h2>¿Qué está fallando?</h2>
      <div class="opciones" id="tipos">${fallas.map((v) => `<button type="button" data-tipo="${v}" aria-pressed="false"${principales.includes(v) ? "" : " hidden"}><span class="ic">${iconoSvg(v)}</span>${ETIQUETA[v]}</button>`).join("")}</div>
      <button type="button" class="mas-tipos" id="mas-tipos"${fallas.length > principales.length ? "" : " hidden"}>Ver más: ${fallas.filter((v) => !principales.includes(v)).map((v) => ETIQUETA[v]).join(", ")}${iconoSvg("abajo")}</button>
      <div class="aviso-duplicado" id="aviso-duplicado" role="status" hidden></div>
      <div class="guia" id="guia" hidden></div>
      <details class="extra" id="extra">
        <summary>${iconoSvg("registrar")}<span id="titulo-extra">Agregar detalle o foto (opcional)</span></summary>
        <label><span id="etiqueta-detalle">Detalle (opcional)</span><textarea id="detalle" rows="2" maxlength="500" placeholder="Ej. desde cuándo pasa o qué ya probaste"></textarea></label>
        <p class="sugerencia" id="sugerencia" role="status" hidden></p>
        <div class="foto">
          <span class="etiqueta-foto">Fotos (opcional, hasta 3)</span>
          <div class="vista-foto" id="vista"></div>
          <label class="boton-foto" id="elegir-foto">${iconoSvg("camara")}<span id="texto-foto">Tomar o elegir foto</span><input type="file" id="archivo" accept="image/*" multiple hidden /></label>
        </div>
      </details>
      <div class="acciones-reporte">
        <button type="button" class="enviar" data-bloquea="0" disabled>Avisar a TI</button>
        <button type="button" class="enviar boton-urgente" data-bloquea="1" disabled>${iconoSvg("alerta")}${aula.clases ? "No puedo continuar mi clase" : "No puedo seguir trabajando"}</button>
      </div>
      <p class="aviso-elegir suave" id="aviso-elegir">Primero elige qué está fallando.</p>
      <p class="error" id="error" role="alert"></p>
    </form>
    <button type="button" class="enlace-dano" id="reportar-dano">${iconoSvg("dano")}<span>¿Algo dañado? Chromebook, carpetas, ventilador, pared…</span></button>
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
    guardarQr();
  }

  // Lo elegido y escrito se guarda en el celular hasta enviarlo: si el docente sale sin querer, al volver sigue ahí.
  // Las fotos no se guardan (pesan demasiado), solo cuántas había para avisar que hay que elegirlas de nuevo
  function guardarQr() {
    const detalle = detalleCampo.value;
    if (!tipo && !detalle.trim()) borrarBorrador(CLAVE_BORRADOR);
    else guardarBorrador<BorradorQr>(CLAVE_BORRADOR, { tipo, detalle, fotos: fotos.length });
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

  const masTipos = document.getElementById("mas-tipos")!;
  masTipos.addEventListener("click", () => {
    for (const b of document.querySelectorAll<HTMLButtonElement>("#tipos button[hidden]")) b.hidden = false;
    masTipos.hidden = true;
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
    // Los pasos de la guía empujan los botones fuera de la pantalla: quedan fijos abajo para no tener que buscarlos
    botones[0].parentElement!.classList.add("fijas");
    // En "Otro" TI necesita saber qué pasa, y si ya hay un reporte del mismo tipo, en qué se diferencia:
    // en ambos casos el detalle se abre y es obligatorio
    const otro = tipo === "otro";
    const titulo = otro ? "Describe la falla" : repetido() ? "¿En qué es diferente?" : null;
    document.getElementById("etiqueta-detalle")!.textContent = titulo ?? "Detalle (opcional)";
    document.getElementById("titulo-extra")!.textContent = titulo ?? "Agregar detalle o foto (opcional)";
    detalleCampo.placeholder = EJEMPLO[tipo];
    if (titulo) extra.open = true;
    avisarDuplicado();
    mostrarGuia();
    sugerir();
    guardarQr();
  });

  // Asistencia guiada: antes de avisar, los pasos que TI dejó en la ficha de esa falla.
  // Si ya hay un reporte del mismo tipo no se muestran: TI ya está avisado.
  // "No puedo continuar mi clase" sigue avisando directo, sin probar nada
  const guia = document.getElementById("guia")!;
  let fichaVista: number | null = null;
  function mostrarGuia() {
    const lista = tipo && !repetido() ? estado.guias.filter((g) => g.tipo_falla === tipo) : [];
    fichaVista = lista[0]?.id ?? null;
    guia.hidden = !lista.length;
    if (!lista.length) {
      guia.innerHTML = "";
      return;
    }
    const contenido = (g: GuiaDocente) => `
      <ol>${g.pasos.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>
      ${g.cuando_llamar_ti ? `<p class="suave">Avisa a TI: ${esc(g.cuando_llamar_ti)}</p>` : ""}
      <button type="button" class="boton-funciono" data-funciono="${g.id}">${iconoSvg("check")}Ya funciona</button>`;
    guia.innerHTML = `
      <p class="guia-titulo">Antes de avisar, prueba esto</p>
      ${
        lista.length === 1
          ? `<p class="guia-ficha">${esc(lista[0].titulo)}</p>${contenido(lista[0])}`
          : lista
              .map((g, i) => `<details data-ficha="${g.id}"${i === 0 ? " open" : ""}><summary>${esc(g.titulo)}</summary>${contenido(g)}</details>`)
              .join("")
      }
      <p class="suave guia-pie">¿No se arregló? Avisa a TI abajo; ya sabrán qué probaste.</p>`;
  }
  // Con varias fichas, la que abrió es la que cuenta como vista
  guia.addEventListener(
    "toggle",
    (e) => {
      const d = e.target as HTMLDetailsElement;
      if (d.open && d.dataset.ficha) fichaVista = Number(d.dataset.ficha);
    },
    true,
  );
  guia.addEventListener("click", async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-funciono]");
    if (!b) return;
    b.disabled = true;
    b.textContent = "Guardando…";
    error.textContent = "";
    const res = await fetch(`/api/qr/${encodeURIComponent(codigo)}/autosolucion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ficha_id: Number(b.dataset.funciono) }),
    }).catch(() => null);
    if (!res?.ok) {
      error.textContent = "No se pudo guardar. Revisa tu conexión e intenta de nuevo.";
      b.disabled = false;
      b.innerHTML = `${iconoSvg("check")}Ya funciona`;
      return;
    }
    borrarBorrador(CLAVE_BORRADOR);
    pintar(
      estado,
      `<section class="tarjeta exito">
        <h2><span class="check">${iconoSvg("check")}</span>¡Bien, lo solucionaste!</h2>
        <p>No se envió ningún reporte a TI. Quedó registrado que estos pasos funcionaron, para que TI sepa cuáles sirven.</p>
        <a class="enviar boton-listo" href="/docente">Entendido</a>
        <button type="button" class="enlace-otra" id="otra-falla">Volvió a fallar: avisar a TI</button>
      </section>`,
      true,
    );
    scrollTo(0, 0);
  });

  // Si el detalle habla de otra falla ("No agarra el internet" con Laptop elegido), se sugiere cambiarla
  const sugerencia = document.getElementById("sugerencia")!;
  function sugerir() {
    const sugerido = sugerirTipo(detalleCampo.value, tipo);
    const otro = sugerido && fallas.includes(sugerido) ? sugerido : null;
    sugerencia.hidden = !otro;
    if (!otro) return;
    sugerencia.innerHTML = `Lo que escribiste parece una falla de <strong>${ETIQUETA[otro]}</strong>. <button type="button" data-cambiar="${otro}">Cambiar a ${ETIQUETA[otro]}</button>`;
  }
  detalleCampo.addEventListener("input", () => {
    sugerir();
    guardarQr();
  });
  sugerencia.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-cambiar]");
    if (!b) return;
    const opcion = document.querySelector<HTMLButtonElement>(`#tipos [data-tipo="${b.dataset.cambiar}"]`);
    if (!opcion) return;
    if (opcion.hidden) masTipos.click();
    opcion.click();
  });

  // Si ya hay un reporte abierto del mismo tipo, se avisa sin bloquear: puede ser otra falla del mismo equipo
  const avisoDuplicado = document.getElementById("aviso-duplicado")!;
  const previoDelTipo = () => (tipo && tipo !== "otro" ? abiertos.find((r) => r.tipo_falla === tipo) : undefined);
  const repetido = () => Boolean(previoDelTipo());
  function avisarDuplicado() {
    const previo = previoDelTipo();
    avisoDuplicado.hidden = !previo;
    if (!previo) return;
    const nombre = ETIQUETA[previo.tipo_falla];
    avisoDuplicado.innerHTML = `
      <p class="aviso-duplicado-titulo">${iconoSvg("info")}Ya existe un reporte de ${nombre}</p>
      <p>TI ya tiene registrada una falla de ${nombre} en esta aula. Estado: <strong>${ESTADO[previo.estado] ?? previo.estado}</strong>.</p>
      <button type="button" class="ver-estado" id="ver-estado">Ver estado del reporte</button>
      <p class="suave">¿Es una falla diferente? Cuenta abajo en qué es diferente y avisa igual.</p>`;
    document.getElementById("ver-estado")!.addEventListener("click", () => {
      const fila = document.querySelector<HTMLElement>(`.abiertos li[data-tipo="${previo.tipo_falla}"]`);
      if (!fila) return;
      fila.scrollIntoView({ behavior: "smooth", block: "center" });
      fila.classList.remove("resaltado");
      void fila.offsetWidth;
      fila.classList.add("resaltado");
    });
  }

  const form = document.getElementById("form") as HTMLFormElement;
  form.addEventListener("submit", (e) => e.preventDefault());
  // Tras enviar, el formulario queda oculto para que la confirmación sea lo único pendiente de leer
  document.getElementById("otra-falla")?.addEventListener("click", (e) => {
    (e.currentTarget as HTMLElement).hidden = true;
    form.hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  for (const boton of botones) boton.addEventListener("click", () => enviarReporte(boton));
  document.getElementById("reportar-dano")!.addEventListener("click", () => {
    pintarDano(estado);
    scrollTo(0, 0);
  });

  const previo = enviado ? null : leerBorrador<BorradorQr>(CLAVE_BORRADOR, VIGENCIA_BORRADOR_MIN);
  if (previo) {
    const { tipo: t, detalle, fotos: n } = previo.datos;
    const opcion = t ? document.querySelector<HTMLButtonElement>(`#tipos [data-tipo="${t}"]`) : null;
    if (opcion) {
      if (opcion.hidden) masTipos.click();
      opcion.click();
    }
    if (detalle) {
      detalleCampo.value = detalle;
      extra.open = true;
      sugerir();
      guardarQr();
    }
    const aviso = document.getElementById("borrador")!;
    aviso.innerHTML = `${iconoSvg("info")}<span>Recuperamos tu reporte sin enviar. Revísalo y toca <strong>Avisar a TI</strong>.${
      n ? ` ${n === 1 ? "La foto hay" : "Las fotos hay"} que volver a elegirla${n === 1 ? "" : "s"}.` : ""
    } <button type="button" id="descartar-borrador">Descartar</button></span>`;
    aviso.hidden = false;
    document.getElementById("descartar-borrador")!.addEventListener("click", () => {
      borrarBorrador(CLAVE_BORRADOR);
      pintar(estado, avisoPrevio);
    });
  }

  async function enviarReporte(boton: HTMLButtonElement) {
    if (!tipo) return;
    const bloquea = boton.dataset.bloquea === "1";
    const detalle = detalleCampo.value.trim();
    if ((tipo === "otro" || repetido()) && !detalle) {
      error.textContent = repetido()
        ? "Cuenta en pocas palabras en qué es diferente de la falla ya reportada."
        : "Escribe en pocas palabras qué está fallando.";
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
      body: JSON.stringify({
        tipo_falla: tipo,
        bloquea_clase: bloquea,
        descripcion: detalle,
        entrada,
        ficha_vista_id: guia.hidden ? null : fichaVista,
      }),
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

    const espera = bloquea ? minutos(estado.espera_urgente_min) : null;
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
    borrarBorrador(CLAVE_BORRADOR);
    const nuevo = await fetch(`/api/qr/${encodeURIComponent(codigo)}`).then((r) => (r.ok ? r.json() : null));
    pintar((nuevo as EstadoAulaQr) ?? estado, confirmacion, true);
    scrollTo(0, 0);
  }
}

// Daños: los de equipos tecnológicos le llegan a TI y a COA; los del local, solo a COA
function pintarDano(estado: EstadoAulaQr) {
  const { aula, email } = estado;
  let grupo: GrupoDano = "tecnologia";
  let grupoElegido = false;
  let tipo: TipoDano | null = null;
  const fotos: Blob[] = [];
  const MAX_FOTOS = 3;
  const ICONO = { tecnologia: "chromebook", local: "edificio" } as const;
  // La sección sale del aula y no se escribe a mano. Si el aula es de dos secciones (ej. ML/10B), se elige una
  const secciones = seccionesDe(aula.seccion);
  const campoSeccion =
    secciones.length > 1
      ? `<select id="seccion">${secciones.map((s) => `<option>${esc(s)}</option>`).join("")}</select>`
      : secciones.length === 1
        ? `<input id="seccion" value="${esc(secciones[0])}" readonly /><span class="suave">Es la sección de esta aula.</span>`
        : `<input id="seccion" maxlength="20" />`;

  app.innerHTML = `
    ${cabecera(aula)}
    <form id="form-dano">
      <div class="borrador-recuperado" id="borrador-dano" role="status" hidden></div>
      <h2>¿Qué tipo de daño es?</h2>
      <div class="opciones opciones-dano" id="grupos">${(["tecnologia", "local"] as const)
        .map((g) => `<button type="button" data-grupo="${g}" aria-pressed="false"><span class="ic">${iconoSvg(ICONO[g])}</span>${GRUPO_DANO[g]}</button>`)
        .join("")}</div>
      <label class="campo-dano" id="campo-tipo-dano" hidden>¿Qué está dañado?<select id="tipo-dano"></select></label>
      <div class="campos-chromebook solo-tecnologia" hidden>
        <label>Sección del estudiante${campoSeccion}</label>
      </div>
      <!-- Lo opcional va plegado, como "Agregar detalle o foto" del reporte a TI, para que el formulario no se vea largo -->
      <details class="extra" id="extra-dano">
        <summary>${iconoSvg("registrar")}<span id="titulo-extra-dano">Agregar detalle (opcional)</span></summary>
        <div class="campos-chromebook">
          <label class="solo-tecnologia" hidden>Código del equipo (opcional)<input id="equipo" maxlength="40" placeholder="Si se ve en la etiqueta, ej. CB-ML-12" /></label>
          <label class="solo-tecnologia" hidden>Estudiante (opcional)<input id="estudiante" maxlength="80" /><span class="suave">Solo lo ven TI y ${EQUIPO_DANOS}.</span></label>
          <label class="campo-dano"><span id="etiqueta-detalle-dano">Detalle (opcional)</span><textarea id="detalle-dano" rows="2" maxlength="500"></textarea></label>
        </div>
      </details>
      <div class="foto">
        <span class="etiqueta-foto">Fotos (opcional, hasta 3)</span>
        <div class="vista-foto" id="vista-dano"></div>
        <label class="boton-foto" id="elegir-foto-dano">${iconoSvg("camara")}<span id="texto-foto-dano">Tomar o elegir foto</span><input type="file" id="archivo-dano" accept="image/*" multiple hidden /></label>
      </div>
      <button type="button" class="enviar" id="enviar-dano" disabled>Enviar</button>
      <p class="suave" id="destino-dano"></p>
      <p class="error" id="error-dano" role="alert"></p>
    </form>
    <!-- El cambio entre "falla para TI" y "algo dañado" queda abajo en las dos pantallas, para no sumar otra flecha arriba -->
    <button type="button" class="enlace-dano" id="volver">${iconoSvg("pc")}<span>¿Es una falla para TI? ${fallasDe(aula)
      .filter((t) => t !== "otro")
      .slice(0, 3)
      .map((t, i) => (i ? etiquetaFalla(t, aula.equipo).toLowerCase() : etiquetaFalla(t, aula.equipo)))
      .join(", ")}…</span></button>
    <p class="pie">Reportando como ${esc(email)}</p>`;

  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const enviar = $<HTMLButtonElement>("enviar-dano");
  const error = $("error-dano");
  const detalle = $<HTMLTextAreaElement>("detalle-dano");
  const extra = $<HTMLDetailsElement>("extra-dano");
  const tipos = $<HTMLSelectElement>("tipo-dano");

  $("volver").addEventListener("click", () => pintar(estado));

  // Lista desplegable con los tipos del grupo elegido: ocupa una línea en vez de siete botones
  function pintarTipos() {
    $("campo-tipo-dano").hidden = false;
    tipos.innerHTML = `<option value="">Elige una opción</option>${tiposDe(grupo)
      .map((t) => `<option value="${t}">${TIPOS_DANO[t].etiqueta}</option>`)
      .join("")}`;
    tipos.value = tipo ?? "";
    pintarEstado();
  }
  function pintarEstado() {
    for (const el of document.querySelectorAll<HTMLElement>(".solo-tecnologia")) el.hidden = grupo !== "tecnologia";
    const otro = Boolean(tipo?.endsWith("_otro"));
    $("etiqueta-detalle-dano").textContent = otro ? "Describe el daño" : "Detalle (opcional)";
    $("titulo-extra-dano").textContent = otro
      ? "Describe el daño"
      : grupo === "tecnologia"
        ? "Agregar código, estudiante o detalle (opcional)"
        : "Agregar detalle (opcional)";
    // "Otro" pide describirlo: se abre solo
    if (otro) extra.open = true;
    detalle.placeholder = grupo === "tecnologia" ? "Ej. La pantalla tiene una rajadura en la esquina" : "Ej. El ventilador hace ruido y no gira";
    enviar.disabled = !tipo;
    enviar.textContent = "Enviar";
    $("destino-dano").textContent = `Le llega a ${DESTINO_DANO[grupo]}.`;
  }

  $("grupos").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-grupo]");
    if (!b) return;
    grupo = b.dataset.grupo as GrupoDano;
    grupoElegido = true;
    tipo = null;
    for (const x of b.parentElement!.children) {
      x.classList.toggle("activo", x === b);
      x.setAttribute("aria-pressed", String(x === b));
    }
    pintarTipos();
    guardarDano();
  });
  tipos.addEventListener("change", () => {
    tipo = (tipos.value || null) as TipoDano | null;
    pintarEstado();
    guardarDano();
  });

  // Como en el reporte a TI: lo elegido y escrito queda en el celular hasta enviarlo.
  // Las fotos no se guardan, solo cuántas había para avisar que hay que elegirlas de nuevo
  const campo = (id: string) => $<HTMLInputElement>(id).value;
  function guardarDano() {
    const datos: BorradorDano = {
      grupo: grupoElegido ? grupo : null,
      tipo,
      equipo: campo("equipo"),
      seccion: campo("seccion"),
      estudiante: campo("estudiante"),
      detalle: detalle.value,
      fotos: fotos.length,
    };
    if (!datos.grupo && !datos.detalle.trim()) borrarBorrador(CLAVE_BORRADOR_DANO);
    else guardarBorrador<BorradorDano>(CLAVE_BORRADOR_DANO, datos);
  }
  for (const id of ["equipo", "seccion", "estudiante", "detalle-dano"]) $(id).addEventListener("input", guardarDano);
  $("seccion").addEventListener("change", guardarDano);

  const archivo = $<HTMLInputElement>("archivo-dano");
  const vista = $("vista-dano");
  let previas: string[] = [];
  function pintarFotos() {
    for (const u of previas) URL.revokeObjectURL(u);
    previas = fotos.map((f) => URL.createObjectURL(f));
    vista.innerHTML = previas
      .map((u, i) => `<div class="miniatura"><img src="${u}" alt="Foto ${i + 1}" /><button type="button" data-quitar="${i}" aria-label="Quitar foto ${i + 1}">✕</button></div>`)
      .join("");
    $("elegir-foto-dano").hidden = fotos.length >= MAX_FOTOS;
    $("texto-foto-dano").textContent = fotos.length ? `Agregar otra foto (${fotos.length}/${MAX_FOTOS})` : "Tomar o elegir foto";
    guardarDano();
  }

  const previo = leerBorrador<BorradorDano>(CLAVE_BORRADOR_DANO, VIGENCIA_BORRADOR_MIN);
  if (previo) {
    const b = previo.datos;
    if (b.grupo) $("grupos").querySelector<HTMLButtonElement>(`[data-grupo="${b.grupo}"]`)?.click();
    if (b.tipo && TIPOS_DANO[b.tipo]?.grupo === grupo) {
      tipo = b.tipo;
      tipos.value = b.tipo;
      pintarEstado();
    }
    $<HTMLInputElement>("equipo").value = b.equipo ?? "";
    // La sección guardada solo vale si es del aula (o si el aula no tiene sección)
    if (b.seccion && (!secciones.length || secciones.includes(b.seccion))) $<HTMLInputElement>("seccion").value = b.seccion;
    $<HTMLInputElement>("estudiante").value = b.estudiante ?? "";
    detalle.value = b.detalle ?? "";
    if (b.equipo || b.estudiante || b.detalle) extra.open = true;
    guardarDano();
    const aviso = $("borrador-dano");
    aviso.innerHTML = `${iconoSvg("info")}<span>Recuperamos tu aviso sin enviar. Revísalo y toca <strong>Enviar</strong>.${
      b.fotos ? ` ${b.fotos === 1 ? "La foto hay" : "Las fotos hay"} que volver a elegirla${b.fotos === 1 ? "" : "s"}.` : ""
    } <button type="button" id="descartar-borrador-dano">Descartar</button></span>`;
    aviso.hidden = false;
    $("descartar-borrador-dano").addEventListener("click", () => {
      borrarBorrador(CLAVE_BORRADOR_DANO);
      pintarDano(estado);
    });
  }
  archivo.addEventListener("change", async () => {
    const elegidos = [...(archivo.files ?? [])].slice(0, MAX_FOTOS - fotos.length);
    archivo.value = "";
    for (const f of elegidos) {
      try {
        fotos.push(await comprimir(f));
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

  enviar.addEventListener("click", async () => {
    if (!tipo) return;
    if (tipo.endsWith("_otro") && !detalle.value.trim()) {
      error.textContent = "Cuenta en pocas palabras qué está dañado.";
      extra.open = true;
      detalle.focus();
      return;
    }
    enviar.disabled = true;
    enviar.textContent = "Enviando…";
    error.textContent = "";
    const res = await fetch(`/api/qr/${encodeURIComponent(codigo)}/danos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo,
        equipo: $<HTMLInputElement>("equipo").value,
        seccion: $<HTMLInputElement>("seccion").value,
        estudiante: $<HTMLInputElement>("estudiante").value,
        descripcion: detalle.value,
      }),
    }).catch(() => null);
    if (!res?.ok) {
      const { error: msg } = ((await res?.json().catch(() => ({}))) ?? {}) as { error?: string };
      error.textContent = msg ?? "No se pudo enviar. Revisa tu conexión e intenta de nuevo.";
      enviar.disabled = false;
      enviar.textContent = "Enviar";
      return;
    }
    const { id } = (await res.json()) as { id: number };
    let fallidas = 0;
    for (const [i, foto] of fotos.entries()) {
      enviar.textContent = fotos.length > 1 ? `Subiendo foto ${i + 1} de ${fotos.length}…` : "Subiendo foto…";
      const subida = await fetch(`/api/qr/${encodeURIComponent(codigo)}/danos/${id}/foto`, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: foto,
      }).catch(() => null);
      if (!subida?.ok) fallidas++;
    }
    borrarBorrador(CLAVE_BORRADOR_DANO);
    pintar(
      estado,
      `<section class="tarjeta exito">
        <h2><span class="check">${iconoSvg("check")}</span>Listo, avisamos a ${DESTINO_DANO[grupo]}</h2>
        <p>${TIPOS_DANO[tipo].etiqueta}. ${ETIQUETA_ATIENDE[ATIENDE_DANO[grupo]]} se encarga del seguimiento.</p>${
          fallidas ? `<p class="suave">El aviso llegó, pero ${fallidas === 1 ? "una foto no se pudo subir" : `${fallidas} fotos no se pudieron subir`}.</p>` : ""
        }
        <a class="enviar boton-listo" href="/docente">Entendido</a>
        <button type="button" class="enlace-otra" id="otra-falla">Reportar una falla a TI</button>
      </section>`,
      true,
    );
    scrollTo(0, 0);
  });
}

cargar().catch(() => mensaje("Sin conexión", "Revisa tu internet e intenta de nuevo."));
