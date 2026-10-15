// Página que abre el docente al escanear el QR del aula.
// Sin React a propósito: pesa unos pocos KB y carga al instante con datos móviles.
import type { EstadoAulaQr, TipoFalla } from "../../shared/tipos";
import "./qr.css";

const TIPOS: [TipoFalla, string][] = [
  ["internet", "Internet"],
  ["proyector", "Proyector"],
  ["pc", "PC"],
  ["otro", "Otro"],
];
const ETIQUETA: Record<string, string> = Object.fromEntries(TIPOS);
const ESTADO: Record<string, string> = { abierto: "En cola", en_atencion: "En atención" };
const SEMAFORO: Record<string, string> = {
  verde: "Operativa",
  amarillo: "Con falla",
  rojo: "Clase bloqueada",
};

const app = document.getElementById("app")!;
const codigo = decodeURIComponent(location.pathname.split("/")[2] ?? "");

function esc(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

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

function mensaje(titulo: string, detalle = "") {
  app.innerHTML = `<section class="tarjeta"><h1>${esc(titulo)}</h1>${detalle ? `<p>${esc(detalle)}</p>` : ""}</section>`;
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

function pintar(estado: EstadoAulaQr, aviso = "") {
  const { aula, abiertos, email } = estado;
  let tipo: TipoFalla | null = null;
  let bloquea = false;
  const fotos: Blob[] = [];
  const MAX_FOTOS = 3;

  const reportados = abiertos.length
    ? `<section class="tarjeta">
        <h2>Ya reportado en esta aula</h2>
        <ul class="abiertos">${abiertos
          .map(
            (r) =>
              `<li><span><strong>${ETIQUETA[r.tipo_falla]}</strong>${r.bloquea_clase ? " · urgente" : ""}</span><span class="estado-reporte">${ESTADO[r.estado] ?? ""}</span></li>`,
          )
          .join("")}</ul>
        <p class="suave">TI ya fue avisado. Solo reporta si es otra falla.</p>
      </section>`
    : "";

  app.innerHTML = `
    <header class="cabecera">
      <h1>${esc(aula.nombre)}</h1>
      <span class="estado ${aula.semaforo}"><i></i>${SEMAFORO[aula.semaforo]}</span>
    </header>
    ${aviso}
    ${reportados}
    <form class="tarjeta" id="form">
      <h2>¿Qué está fallando?</h2>
      <div class="chips" id="tipos">${TIPOS.map(([v, e]) => `<button type="button" data-tipo="${v}">${e}</button>`).join("")}</div>
      <h2>¿Te impide dar la clase ahora?</h2>
      <div class="chips" id="bloquea">
        <button type="button" data-valor="1">Sí</button>
        <button type="button" data-valor="0" class="activo">No</button>
      </div>
      <label>Detalle (opcional)<textarea id="detalle" rows="2" maxlength="500" placeholder="Ej. el proyector no detecta la laptop"></textarea></label>
      <div class="foto">
        <span class="etiqueta-foto">Fotos (opcional, hasta 3)</span>
        <div class="vista-foto" id="vista"></div>
        <label class="boton-foto" id="elegir-foto"><span id="texto-foto">Tomar o elegir foto</span><input type="file" id="archivo" accept="image/*" multiple hidden /></label>
      </div>
      <button type="submit" class="enviar" id="enviar" disabled>Reportar a TI</button>
      <p class="error" id="error" role="alert"></p>
    </form>
    <p class="pie">Reportando como ${esc(email)}</p>`;

  const enviar = document.getElementById("enviar") as HTMLButtonElement;
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
    for (const x of b.parentElement!.children) x.classList.toggle("activo", x === b);
    enviar.disabled = false;
  });

  document.getElementById("bloquea")!.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    bloquea = b.dataset.valor === "1";
    for (const x of b.parentElement!.children) {
      x.classList.toggle("activo", x === b);
      x.classList.toggle("urgente", x === b && bloquea);
    }
  });

  document.getElementById("form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!tipo) return;
    enviar.disabled = true;
    enviar.textContent = "Enviando…";
    error.textContent = "";
    const detalle = (document.getElementById("detalle") as HTMLTextAreaElement).value;
    const res = await fetch(`/api/qr/${encodeURIComponent(codigo)}/reportes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo_falla: tipo, bloquea_clase: bloquea, descripcion: detalle }),
    }).catch(() => null);

    if (!res?.ok) {
      const { error: msg } = ((await res?.json().catch(() => ({}))) ?? {}) as { error?: string };
      error.textContent = msg ?? "No se pudo enviar. Revisa tu conexión e intenta de nuevo.";
      enviar.disabled = false;
      enviar.textContent = "Reportar a TI";
      return;
    }

    // Las fotos se suben una por una después de crear el reporte: si alguna falla, el reporte ya llegó
    let fotosFallidas = 0;
    if (fotos.length) {
      const { id } = (await res.json()) as { id: number };
      for (const [i, foto] of fotos.entries()) {
        enviar.textContent = fotos.length > 1 ? `Subiendo foto ${i + 1} de ${fotos.length}…` : "Subiendo foto…";
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
        <h2>Listo, TI fue avisado</h2>
        <p>${
          espera
            ? `En casos urgentes, TI suele llegar en unos <strong>${espera}</strong>.`
            : "Te atenderán lo antes posible."
        }</p>${
          fotosFallidas
            ? `<p class="suave">El reporte llegó, pero ${fotosFallidas === 1 ? "una foto no se pudo subir" : `${fotosFallidas} fotos no se pudieron subir`}.</p>`
            : ""
        }
      </section>`;
    const nuevo = await fetch(`/api/qr/${encodeURIComponent(codigo)}`).then((r) => (r.ok ? r.json() : null));
    pintar((nuevo as EstadoAulaQr) ?? estado, confirmacion);
    scrollTo(0, 0);
  });
}

cargar().catch(() => mensaje("Sin conexión", "Revisa tu internet e intenta de nuevo."));
