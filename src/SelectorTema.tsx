import { useState } from "react";
import type { NombreIcono } from "../shared/iconos";
import Icono from "./Icono";

type Tema = "claro" | "oscuro" | "auto";

const OPCIONES: { tema: Tema; etiqueta: string; icono: NombreIcono; titulo: string }[] = [
  { tema: "claro", etiqueta: "Claro", icono: "sol", titulo: "Tema claro" },
  { tema: "oscuro", etiqueta: "Oscuro", icono: "luna", titulo: "Tema oscuro" },
  { tema: "auto", etiqueta: "Auto", icono: "auto", titulo: "Automático: igual que el celular o la PC" },
];
const FONDO = { claro: "#f4f5f8", oscuro: "#0b0f14" };

function temaGuardado(): Tema {
  try {
    const t = localStorage.getItem("tema");
    return t === "claro" || t === "oscuro" ? t : "auto";
  } catch {
    return "auto";
  }
}

// El atributo data-tema en <html> activa los estilos del tema elegido (ver vite.config.ts).
// index.html lo aplica antes de pintar para que no parpadee.
function aplicar(tema: Tema) {
  const html = document.documentElement;
  if (tema === "auto") delete html.dataset.tema;
  else html.dataset.tema = tema;
  // La barra del navegador en el celular toma el color del tema elegido
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const delSistema = meta.media.includes("dark") ? FONDO.oscuro : FONDO.claro;
    meta.content = tema === "auto" ? delSistema : FONDO[tema];
  }
  try {
    if (tema === "auto") localStorage.removeItem("tema");
    else localStorage.setItem("tema", tema);
  } catch {
    // Sin almacenamiento (modo privado): el tema dura hasta recargar
  }
}

export default function SelectorTema() {
  const [tema, setTema] = useState<Tema>(temaGuardado);

  return (
    <div className="selector-tema" role="group" aria-label="Tema de colores">
      {OPCIONES.map((o) => (
        <button
          key={o.tema}
          type="button"
          className={tema === o.tema ? "activo" : undefined}
          aria-pressed={tema === o.tema}
          title={o.titulo}
          onClick={() => {
            aplicar(o.tema);
            setTema(o.tema);
          }}
        >
          <Icono nombre={o.icono} />
          <span className="etiqueta-tema">{o.etiqueta}</span>
        </button>
      ))}
    </div>
  );
}
