import { useCallback, useEffect, useState } from "react";
import type { AulaConEstado, EventoEnVivo, Reporte } from "../../shared/tipos";
import type { Ruta } from "../App";
import { api, NoAutorizado, urlEnVivo } from "../api";
import FormResolver from "../FormResolver";
import FotosReporte from "../FotosReporte";
import Icono from "../Icono";
import { duracion, ETIQUETA_FALLA, minutosDesde } from "../formato";

interface Props {
  onNoAutorizado: () => void;
  ir: (r: Ruta) => void;
}

export default function Dashboard({ onNoAutorizado, ir }: Props) {
  const [aulas, setAulas] = useState<AulaConEstado[]>([]);
  const [abiertos, setAbiertos] = useState<Reporte[]>([]);
  const [conectado, setConectado] = useState(false);
  const [resolviendo, setResolviendo] = useState<number | null>(null);

  const cargarReportes = useCallback(() => {
    api<Reporte[]>("/api/reportes?estado=abiertos")
      .then(setAbiertos)
      .catch((e) => (e instanceof NoAutorizado ? onNoAutorizado() : null));
  }, [onNoAutorizado]);

  useEffect(() => {
    api<AulaConEstado[]>("/api/aulas")
      .then(setAulas)
      .catch((e) => (e instanceof NoAutorizado ? onNoAutorizado() : null));
    cargarReportes();
  }, [cargarReportes, onNoAutorizado]);

  // Conexión en vivo con el Durable Object; se reconecta si se cae
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reintento: ReturnType<typeof setTimeout>;
    let cerrado = false;

    function conectar() {
      ws = new WebSocket(urlEnVivo());
      ws.onopen = () => setConectado(true);
      ws.onmessage = (e) => {
        if (e.data === "pong") return;
        const evento = JSON.parse(e.data) as EventoEnVivo;
        setAulas((prev) => prev.map((a) => (a.id === evento.aula.id ? evento.aula : a)));
        cargarReportes();
      };
      ws.onclose = () => {
        setConectado(false);
        if (!cerrado) reintento = setTimeout(conectar, 3000);
      };
    }
    conectar();
    return () => {
      cerrado = true;
      clearTimeout(reintento);
      ws?.close();
    };
  }, [cargarReportes]);

  async function atender(reporte: Reporte) {
    try {
      await api(`/api/reportes/${reporte.id}`, { method: "PATCH", body: JSON.stringify({ estado: "en_atencion" }) });
    } catch (e) {
      if (e instanceof NoAutorizado) onNoAutorizado();
    }
  }

  async function resolver(reporte: Reporte, causa: string, hice: string) {
    try {
      await api(`/api/reportes/${reporte.id}`, {
        method: "PATCH",
        body: JSON.stringify({ estado: "resuelto", causa, notas_resolucion: hice }),
      });
      setResolviendo(null);
    } catch (e) {
      if (e instanceof NoAutorizado) return onNoAutorizado();
      throw e;
    }
  }

  const bloquean = abiertos.filter((r) => r.bloquea_clase).length;
  const enAtencion = abiertos.filter((r) => r.estado === "en_atencion").length;
  const operativas = aulas.filter((a) => a.semaforo === "verde").length;
  const pisos = [...new Set(aulas.map((a) => a.piso))].sort((a, b) => (a ?? 99) - (b ?? 99));

  return (
    <div className="dashboard">
      <header className="cabecera-pagina">
        <div>
          <h1>Dashboard</h1>
          <p className={conectado ? "en-vivo" : "en-vivo desconectado"}>
            <i /> {conectado ? "En vivo" : "Reconectando…"}
          </p>
        </div>
        <button className="secundario" onClick={() => ir({ pantalla: "qr" })}>
          <Icono nombre="qr" /> QR de aulas
        </button>
      </header>

      <section className="resumen">
        <div className="dato">
          <span>Reportes abiertos</span>
          <strong>{abiertos.length}</strong>
        </div>
        <div className={bloquean ? "dato alerta" : "dato"}>
          <span>Bloquean la clase</span>
          <strong>{bloquean}</strong>
        </div>
        <div className="dato">
          <span>En atención</span>
          <strong>{enAtencion}</strong>
        </div>
        <div className="dato">
          <span>Aulas operativas</span>
          <strong>
            {operativas}
            <small> de {aulas.length}</small>
          </strong>
        </div>
      </section>

      <div className="columnas">
        <section className="tarjeta">
          <div className="tarjeta-cabecera">
            <h2>Aulas</h2>
            <div className="leyenda">
              <span><i className="punto verde" /> Operativa</span>
              <span><i className="punto amarillo" /> Con falla</span>
              <span><i className="punto rojo" /> Bloquea la clase</span>
            </div>
          </div>
          {pisos.map((piso) => (
            <div key={piso ?? "otras"} className="piso">
              <h3>{piso == null ? "Otras" : `Piso ${piso}`}</h3>
              <div className="grilla">
                {aulas
                  .filter((a) => a.piso === piso)
                  .map((a) => (
                    <button
                      key={a.id}
                      className={`aula ${a.semaforo}`}
                      onClick={() => ir({ pantalla: "aula", id: a.id })}
                      aria-label={`${a.nombre}: ${a.reportes_abiertos} reportes abiertos`}
                    >
                      <strong>{a.codigo}</strong>
                      {a.reportes_abiertos > 0 && <span className="cuenta">{a.reportes_abiertos}</span>}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </section>

        <section className="tarjeta">
          <div className="tarjeta-cabecera">
            <h2>Reportes abiertos</h2>
          </div>
          {abiertos.length === 0 && (
            <p className="vacio todo-bien">
              <Icono nombre="check" /> Todas las aulas operativas.
            </p>
          )}
          <ul className="reportes">
            {abiertos.map((r) => (
              <li key={r.id} className={r.bloquea_clase ? "reporte bloquea" : "reporte"}>
                <span className={`tipo-icono ${r.tipo_falla}`}>
                  <Icono nombre={r.tipo_falla} />
                </span>
                <div className="reporte-cuerpo">
                  <div className="reporte-titulo">
                    <strong>{r.aula_nombre}</strong>
                    <span>{ETIQUETA_FALLA[r.tipo_falla]}</span>
                  </div>
                  <div className="insignias">
                    {r.bloquea_clase ? <span className="insignia roja">Bloquea la clase</span> : null}
                    {r.estado === "en_atencion" && <span className="insignia azul">En atención</span>}
                    <span className="hace">
                      <Icono nombre="reloj" /> Hace {duracion(minutosDesde(r.reportado_en))}
                    </span>
                  </div>
                  {r.reportado_por_nombre && <small>{r.reportado_por_nombre}</small>}
                  {r.descripcion && <p className="descripcion">{r.descripcion}</p>}
                  {r.fotos > 0 && <FotosReporte reporteId={r.id} total={r.fotos} />}
                  {resolviendo === r.id ? (
                    <FormResolver
                      onGuardar={(causa, hice) => resolver(r, causa, hice)}
                      onCancelar={() => setResolviendo(null)}
                    />
                  ) : (
                    <div className="acciones">
                      {r.estado === "abierto" && <button onClick={() => atender(r)}>Atender</button>}
                      <button className="primario" onClick={() => setResolviendo(r.id)}>
                        Resolver
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
