import { useCallback, useEffect, useState } from "react";
import type { NombreIcono } from "../shared/iconos";
import { consultarSesion, guardarToken, type EstadoSesion } from "./api";
import Icono from "./Icono";
import Logo from "./Logo";
import Acceso from "./pages/Acceso";
import DetalleAula from "./pages/DetalleAula";
import Fichas from "./pages/Fichas";
import Dashboard from "./pages/Dashboard";
import ImprimirQr from "./pages/ImprimirQr";
import Observatorio from "./pages/Observatorio";
import Registro from "./pages/Registro";

export type Ruta =
  | { pantalla: "registro" }
  | { pantalla: "dashboard" }
  | { pantalla: "observatorio" }
  | { pantalla: "fichas" }
  | { pantalla: "qr" }
  | { pantalla: "aula"; id: number };

const PESTANAS: { pantalla: "registro" | "dashboard" | "observatorio" | "fichas"; etiqueta: string; icono: NombreIcono }[] = [
  { pantalla: "registro", etiqueta: "Registrar", icono: "registrar" },
  { pantalla: "dashboard", etiqueta: "Dashboard", icono: "dashboard" },
  { pantalla: "observatorio", etiqueta: "Observatorio", icono: "observatorio" },
  { pantalla: "fichas", etiqueta: "Fichas", icono: "fichas" },
];

function rutaActual(): Ruta {
  const p = location.pathname;
  const aula = p.match(/^\/aula\/(\d+)/);
  if (aula) return { pantalla: "aula", id: Number(aula[1]) };
  if (p.startsWith("/dashboard")) return { pantalla: "dashboard" };
  if (p.startsWith("/observatorio")) return { pantalla: "observatorio" };
  if (p.startsWith("/fichas")) return { pantalla: "fichas" };
  if (p.startsWith("/qr-aulas")) return { pantalla: "qr" };
  return { pantalla: "registro" };
}

function rutaAUrl(r: Ruta): string {
  if (r.pantalla === "aula") return `/aula/${r.id}`;
  if (r.pantalla === "qr") return "/qr-aulas";
  return r.pantalla === "registro" ? "/" : `/${r.pantalla}`;
}

export default function App() {
  const [estado, setEstado] = useState<EstadoSesion>({ tipo: "cargando" });
  const [ruta, setRuta] = useState<Ruta>(rutaActual());

  const verificar = useCallback(() => {
    consultarSesion()
      .then(setEstado)
      .catch(() => setEstado({ tipo: "sin-acceso", detalle: "No se pudo conectar. Revisa tu internet." }));
  }, []);

  useEffect(verificar, [verificar]);

  useEffect(() => {
    const alVolver = () => setRuta(rutaActual());
    addEventListener("popstate", alVolver);
    return () => removeEventListener("popstate", alVolver);
  }, []);

  function ir(destino: Ruta) {
    history.pushState(null, "", rutaAUrl(destino));
    setRuta(destino);
    scrollTo(0, 0);
  }

  const salir = useCallback(() => {
    guardarToken("");
    verificar();
  }, [verificar]);

  if (estado.tipo === "cargando") return <main className="acceso"><p>Cargando…</p></main>;
  if (estado.tipo === "sin-acceso") {
    return (
      <main className="acceso">
        <Logo />
        <p>{estado.detalle}</p>
      </main>
    );
  }
  if (estado.tipo === "pedir-clave") {
    return (
      <Acceso
        onIngresar={(t) => {
          guardarToken(t);
          verificar();
        }}
      />
    );
  }

  const pestana = ruta.pantalla === "aula" || ruta.pantalla === "qr" ? "dashboard" : ruta.pantalla;

  return (
    <>
      <header className="cabecera-app">
        <div className="cabecera-contenido">
          <Logo />
          <nav className="barra" aria-label="Secciones">
            {PESTANAS.map((p) => (
              <button
                key={p.pantalla}
                className={pestana === p.pantalla ? "activo" : ""}
                aria-current={pestana === p.pantalla ? "page" : undefined}
                onClick={() => ir({ pantalla: p.pantalla })}
              >
                <Icono nombre={p.icono} />
                <span>{p.etiqueta}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main>
        {ruta.pantalla === "registro" && <Registro onNoAutorizado={salir} />}
        {ruta.pantalla === "dashboard" && <Dashboard onNoAutorizado={salir} ir={ir} />}
        {ruta.pantalla === "observatorio" && <Observatorio onNoAutorizado={salir} ir={ir} />}
        {ruta.pantalla === "fichas" && <Fichas onNoAutorizado={salir} />}
        {ruta.pantalla === "qr" && <ImprimirQr onNoAutorizado={salir} ir={ir} />}
        {ruta.pantalla === "aula" && <DetalleAula id={ruta.id} onNoAutorizado={salir} ir={ir} />}
      </main>
    </>
  );
}
