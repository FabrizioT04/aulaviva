// Inicio del docente (/docente): escanear el QR del aula desde la misma página,
// sin saber usar la cámara del celular, o elegir el aula de una lista.
// Liviana como la página del QR: el lector se descarga solo al tocar "Escanear".
import { iconoSvg } from "../../shared/iconos";
import type { AulaConEstado, AulasDocente } from "../../shared/tipos";
import { activarBotonTema, botonTema, esc, MARCA } from "./comun";
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

function normalizar(t: string): string {
  return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "");
}

function botonAula(a: AulaConEstado): string {
  const nombre = `Aula ${a.codigo}${a.seccion ? `, ${a.seccion}` : ""}, ${SEMAFORO[a.semaforo]}`;
  return `<a class="aula-item ${a.semaforo}" href="/r/${encodeURIComponent(a.codigo)}?via=lista" aria-label="${esc(nombre)}" data-buscar="${esc(normalizar(`${a.codigo} ${a.seccion ?? ""} ${a.nombre} ${a.nivel ?? ""} ${a.pabellon ? `pabellón ${a.pabellon}` : ""}`))}">
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

function pintar(datos: AulasDocente | null, error = "") {
  const pisos = new Map<string, AulaConEstado[]>();
  for (const a of datos?.aulas ?? []) {
    const piso = a.piso != null ? `Piso ${a.piso}` : "Otras";
    pisos.set(piso, [...(pisos.get(piso) ?? []), a]);
  }
  const lista = [...pisos]
    .sort(([x], [y]) => y.localeCompare(x))
    .map(([piso, aulas]) => `<div class="grupo-piso" data-piso><h3>${piso}</h3><div class="aulas-docente">${aulas.map(botonAula).join("")}</div></div>`)
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
    <section class="tarjeta elegir">
      <h2>¿No puedes escanear? Elige tu aula</h2>
      <label class="buscar">${iconoSvg("buscar")}<input id="buscar" type="search" inputmode="search" autocomplete="off" placeholder="Ej. 204, 4A o primaria" aria-label="Buscar aula por número, sección, nivel o pabellón" /></label>
      <p class="leyenda" aria-hidden="true"><span><i class="verde"></i>Sin reportes</span><span><i class="amarillo"></i>Falla reportada</span><span><i class="rojo"></i>Clase bloqueada</span></p>
      <p class="conteo" id="conteo" aria-live="polite"></p>
      <div id="lista">${lista || `<p class="suave">${esc(error || "No hay aulas para mostrar.")}</p>`}</div>
      <p class="suave" id="sin-resultados" hidden>No hay un aula con ese número, sección o nivel.</p>
    </section>
    <div id="instalar"></div>
    ${datos ? `<p class="pie">Conectado como ${esc(datos.email)}</p>` : ""}`;

  pintarInstalar();

  const buscar = document.getElementById("buscar") as HTMLInputElement;
  buscar.addEventListener("input", () => {
    const q = normalizar(buscar.value);
    let visibles = 0;
    for (const grupo of app.querySelectorAll<HTMLElement>("[data-piso]")) {
      let enGrupo = 0;
      for (const a of grupo.querySelectorAll<HTMLElement>(".aula-item")) {
        const ve = !q || a.dataset.buscar!.includes(q);
        a.hidden = !ve;
        if (ve) enGrupo++;
      }
      grupo.hidden = enGrupo === 0;
      visibles += enGrupo;
    }
    document.getElementById("sin-resultados")!.hidden = visibles > 0 || !datos?.aulas.length;
    // Con varias coincidencias, el conteo ayuda a notar que hay que elegir por piso y sección
    document.getElementById("conteo")!.textContent = q && visibles ? (visibles === 1 ? "1 aula coincide" : `${visibles} aulas coinciden`) : "";
  });

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
