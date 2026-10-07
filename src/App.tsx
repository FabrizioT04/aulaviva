import { useEffect, useState } from "react";
import { guardarToken, leerToken } from "./api";
import Acceso from "./pages/Acceso";
import DetalleAula from "./pages/DetalleAula";
import Dashboard from "./pages/Dashboard";
import Observatorio from "./pages/Observatorio";
import Registro from "./pages/Registro";

export type Ruta =
  | { pantalla: "registro" }
  | { pantalla: "dashboard" }
  | { pantalla: "observatorio" }
  | { pantalla: "aula"; id: number };

function rutaActual(): Ruta {
  const p = location.pathname;
  const aula = p.match(/^\/aula\/(\d+)/);
  if (aula) return { pantalla: "aula", id: Number(aula[1]) };
  if (p.startsWith("/dashboard")) return { pantalla: "dashboard" };
  if (p.startsWith("/observatorio")) return { pantalla: "observatorio" };
  return { pantalla: "registro" };
}

function rutaAUrl(r: Ruta): string {
  if (r.pantalla === "aula") return `/aula/${r.id}`;
  return r.pantalla === "registro" ? "/" : `/${r.pantalla}`;
}

export default function App() {
  const [token, setToken] = useState(leerToken());
  const [ruta, setRuta] = useState<Ruta>(rutaActual());

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

  function salir() {
    guardarToken("");
    setToken("");
  }

  if (!token) {
    return (
      <Acceso
        onIngresar={(t) => {
          guardarToken(t);
          setToken(t);
        }}
      />
    );
  }

  const pestana = ruta.pantalla === "aula" ? "dashboard" : ruta.pantalla;

  return (
    <>
      <nav className="barra">
        <button className={pestana === "registro" ? "activo" : ""} onClick={() => ir({ pantalla: "registro" })}>
          Registrar
        </button>
        <button className={pestana === "dashboard" ? "activo" : ""} onClick={() => ir({ pantalla: "dashboard" })}>
          Dashboard
        </button>
        <button
          className={pestana === "observatorio" ? "activo" : ""}
          onClick={() => ir({ pantalla: "observatorio" })}
        >
          Observatorio
        </button>
      </nav>
      <main>
        {ruta.pantalla === "registro" && <Registro onNoAutorizado={salir} />}
        {ruta.pantalla === "dashboard" && <Dashboard onNoAutorizado={salir} ir={ir} />}
        {ruta.pantalla === "observatorio" && <Observatorio onNoAutorizado={salir} ir={ir} />}
        {ruta.pantalla === "aula" && <DetalleAula id={ruta.id} onNoAutorizado={salir} ir={ir} />}
      </main>
    </>
  );
}
