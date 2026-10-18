import { useCallback, useEffect, useState } from "react";
import type { NombreIcono } from "../shared/iconos";
import { consultarSesion, guardarToken, type EstadoSesion } from "./api";
import Icono from "./Icono";
import Logo from "./Logo";
import Notificaciones from "./Notificaciones";
import SelectorTema from "./SelectorTema";
import { usePendientes, type Pendientes } from "./usePendientes";
import Acceso from "./pages/Acceso";
import Danos from "./pages/Danos";
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
  | { pantalla: "danos" }
  | { pantalla: "aula"; id: number };

const PESTANAS: {
  pantalla:
    | "registro"
    | "dashboard"
    | "observatorio"
    | "fichas"
    | "danos"
    | "qr";
  etiqueta: string;
  corta?: string; // para la barra inferior del celular, si la etiqueta no cabe
  icono: NombreIcono;
  soloPc?: boolean; // en el celular la barra inferior solo tiene espacio para cuatro
}[] = [
  { pantalla: "registro", etiqueta: "Registrar", icono: "registrar" },
  { pantalla: "dashboard", etiqueta: "Dashboard", icono: "dashboard" },
  { pantalla: "observatorio", etiqueta: "Observatorio", icono: "observatorio" },
  {
    pantalla: "fichas",
    etiqueta: "Base de conocimiento",
    corta: "Soluciones",
    icono: "fichas",
  },
  {
    pantalla: "danos",
    etiqueta: "Daños y mantenimiento",
    corta: "Daños",
    icono: "dano",
  },
  { pantalla: "qr", etiqueta: "QR de aulas", icono: "qr", soloPc: true },
];

// COA ve todo el panel, pero solo cambia los daños del local
const AREA_USUARIO: Record<string, string> = {
  ti: "Área de TI",
  coa: "COA",
};

// El número de casos sin resolver que lleva cada pestaña del menú
function cuentaDe(pantalla: Ruta["pantalla"], pendientes: Pendientes): number {
  if (pantalla === "dashboard") return pendientes.reportes;
  if (pantalla === "danos") return pendientes.danos;
  return 0;
}

function rutaActual(): Ruta {
  const p = location.pathname;
  const aula = p.match(/^\/aula\/(\d+)/);
  if (aula) return { pantalla: "aula", id: Number(aula[1]) };
  if (p.startsWith("/dashboard")) return { pantalla: "dashboard" };
  if (p.startsWith("/observatorio")) return { pantalla: "observatorio" };
  if (p.startsWith("/fichas")) return { pantalla: "fichas" };
  if (p.startsWith("/qr-aulas")) return { pantalla: "qr" };
  if (p.startsWith("/danos")) return { pantalla: "danos" };
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
      .catch(() =>
        setEstado({
          tipo: "sin-acceso",
          detalle: "No se pudo conectar. Revisa tu internet.",
        }),
      );
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

  const pendientes = usePendientes(estado.tipo === "ok" ? estado.sesion.rol : null, salir);

  if (estado.tipo === "cargando")
    return (
      <main className="acceso">
        <p>Cargando…</p>
      </main>
    );
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

  const { sesion } = estado;
  const soloLectura = sesion.rol !== "ti";
  // COA no registra incidencias: entra directo a Daños
  const pantalla: Ruta =
    soloLectura && ruta.pantalla === "registro" ? { pantalla: "danos" } : ruta;
  const pestana =
    pantalla.pantalla === "aula" ? "dashboard" : pantalla.pantalla;
  const pestanas = soloLectura
    ? PESTANAS.filter((p) => p.pantalla !== "registro")
    : PESTANAS;
  const usuario =
    sesion.modo === "local"
      ? `${sesion.rol === "ti" ? "TI" : AREA_USUARIO[sesion.rol]} (local)`
      : sesion.email.split("@")[0];

  return (
    <div className="app">
      <header className="cabecera-app">
        <Logo />
        {pestanas.length > 1 && (
          <nav className="barra" aria-label="Secciones">
            {pestanas.map((p) => (
              <button
                key={p.pantalla}
                className={[
                  pestana === p.pantalla ? "activo" : "",
                  p.soloPc ? "solo-pc" : "",
                ]
                  .join(" ")
                  .trim()}
                aria-current={pestana === p.pantalla ? "page" : undefined}
                onClick={() => ir({ pantalla: p.pantalla })}
              >
                <Icono nombre={p.icono} />
                {p.corta ? (
                  <>
                    <span className="etiqueta-larga">{p.etiqueta}</span>
                    <span className="etiqueta-corta">{p.corta}</span>
                  </>
                ) : (
                  <span>{p.etiqueta}</span>
                )}
                {cuentaDe(p.pantalla, pendientes) > 0 && (
                  <span className="cuenta-nav" title={`${cuentaDe(p.pantalla, pendientes)} sin resolver`}>
                    {cuentaDe(p.pantalla, pendientes) > 99 ? "99+" : cuentaDe(p.pantalla, pendientes)}
                    <span className="solo-lector"> sin resolver</span>
                  </span>
                )}
              </button>
            ))}
          </nav>
        )}
        <div className="controles-cabecera">
          {!soloLectura && <Notificaciones />}
          <SelectorTema />
        </div>
        <div className="usuario">
          <span className="avatar" aria-hidden="true">
            {usuario.charAt(0).toUpperCase()}
          </span>
          <span className="usuario-texto">
            <strong>{usuario}</strong>
            <small>{AREA_USUARIO[sesion.rol] ?? "Área de TI"}</small>
          </span>
        </div>
      </header>
      <main>
        {pantalla.pantalla === "danos" && (
          <Danos sesion={sesion} onNoAutorizado={salir} />
        )}
        {pantalla.pantalla === "registro" && (
          <Registro onNoAutorizado={salir} ir={ir} />
        )}
        {pantalla.pantalla === "dashboard" && (
          <Dashboard onNoAutorizado={salir} ir={ir} soloLectura={soloLectura} />
        )}
        {pantalla.pantalla === "observatorio" && (
          <Observatorio onNoAutorizado={salir} ir={ir} />
        )}
        {pantalla.pantalla === "fichas" && <Fichas onNoAutorizado={salir} soloLectura={soloLectura} />}
        {pantalla.pantalla === "qr" && (
          <ImprimirQr onNoAutorizado={salir} ir={ir} />
        )}
        {pantalla.pantalla === "aula" && (
          <DetalleAula id={pantalla.id} onNoAutorizado={salir} ir={ir} />
        )}
      </main>
    </div>
  );
}
