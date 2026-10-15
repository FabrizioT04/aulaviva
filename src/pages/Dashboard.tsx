import { type CSSProperties, useCallback, useEffect, useState } from "react";
import type { AulaConEstado, EventoEnVivo, Metricas, Reporte } from "../../shared/tipos";
import type { Ruta } from "../App";
import { api, NoAutorizado, urlEnVivo } from "../api";
import Contador from "../Contador";
import FormResolver from "../FormResolver";
import FotosReporte from "../FotosReporte";
import Icono from "../Icono";
import { descripcionAula, duracion, ETIQUETA_FALLA, minutosDesde } from "../formato";

interface Props {
  onNoAutorizado: () => void;
  ir: (r: Ruta) => void;
}

export default function Dashboard({ onNoAutorizado, ir }: Props) {
  const [aulas, setAulas] = useState<AulaConEstado[]>([]);
  const [abiertos, setAbiertos] = useState<Reporte[]>([]);
  const [conectado, setConectado] = useState(false);
  const [resolviendo, setResolviendo] = useState<number | null>(null);
  const [atencionProm, setAtencionProm] = useState<number | null>(null);

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
    api<Metricas>("/api/metricas?dias=30")
      .then((m) => setAtencionProm(m.resumen.prom_atencion_min))
      .catch(() => null);
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

  const bloqueantes = abiertos.filter((r) => r.bloquea_clase);
  const enAtencion = abiertos.filter((r) => r.estado === "en_atencion").length;
  const operativas = aulas.filter((a) => a.semaforo === "verde").length;
  const pisos = [...new Set(aulas.map((a) => a.piso))].sort((a, b) => (a ?? 99) - (b ?? 99));
  const hoy = new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Lima" });

  return (
    <div className="dashboard">
      <header className="cabecera-pagina">
        <div>
          <p className="antetitulo">{hoy.charAt(0).toUpperCase() + hoy.slice(1)}</p>
          <h1>Estado de las aulas</h1>
        </div>
        <div className="acciones">
          <span className={conectado ? "en-vivo" : "en-vivo desconectado"}>
            <i /> {conectado ? "En vivo" : "Reconectando…"}
          </span>
          <button className="primario" onClick={() => ir({ pantalla: "registro" })}>
            <Icono nombre="registrar" /> Registrar incidencia
          </button>
        </div>
      </header>

      <section className="resumen" aria-label="Resumen">
        <div className="dato">
          <span>Reportes abiertos</span>
          <strong className="num"><Contador valor={abiertos.length} /></strong>
          <small>{enAtencion === 1 ? "1 en atención" : `${enAtencion} en atención`}</small>
        </div>
        <div className={bloqueantes.length ? "dato alerta" : "dato"}>
          <span>Bloquean la clase</span>
          <strong className="num"><Contador valor={bloqueantes.length} /></strong>
          <small>
            {bloqueantes.length
              ? `${bloqueantes[0].aula_nombre} · hace ${duracion(minutosDesde(bloqueantes[0].reportado_en))}`
              : "Ninguna clase detenida"}
          </small>
        </div>
        <div className="dato">
          <span>Atención promedio</span>
          <strong className="num">{duracion(atencionProm)}</strong>
          <small>Últimos 30 días</small>
        </div>
        <div className="dato">
          <span>Aulas operativas</span>
          <strong className="num">
            <Contador valor={operativas} />
            <small> / {aulas.length}</small>
          </strong>
          <span className="progreso" aria-hidden="true">
            <span style={{ width: `${aulas.length ? (operativas / aulas.length) * 100 : 0}%` }} />
          </span>
        </div>
      </section>

      <div className="columnas">
        <section className="tarjeta">
          <div className="tarjeta-cabecera">
            <h2>Mapa de aulas</h2>
            <div className="leyenda">
              <span><i className="muestra verde" /> Operativa</span>
              <span><i className="muestra amarillo" /> Con falla</span>
              <span><i className="muestra rojo" /> Bloquea</span>
            </div>
          </div>
          <div className="mapa">
            <div className="tablero">
              {pisos.map((piso) => (
                <div key={piso ?? "otras"} className="piso">
                  <h3>{piso == null ? "Otras" : `Piso ${piso}`}</h3>
                  <div className="grilla">
                    {aulas
                      .filter((a) => a.piso === piso)
                      .map((a, i) => (
                        <button
                          key={a.id}
                          className={`aula ${a.semaforo}`}
                          style={{ "--i": i } as CSSProperties}
                          onClick={() => ir({ pantalla: "aula", id: a.id })}
                          aria-label={`${a.nombre}${a.seccion ? ` (${a.seccion})` : ""}: ${a.reportes_abiertos} reportes abiertos`}
                          title={`${a.nombre} · ${descripcionAula(a)}`}
                        >
                          {a.codigo}
                          {a.seccion && <span className="seccion">{a.seccion}</span>}
                          {a.reportes_abiertos > 0 && <span className="cuenta">{a.reportes_abiertos}</span>}
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="tarjeta">
          <div className="tarjeta-cabecera">
            <h2>Cola de atención</h2>
            <span className="nota">Ordenada por urgencia</span>
          </div>
          {abiertos.length === 0 && (
            <p className="todo-bien">
              <Icono nombre="check" /> Todas las aulas operativas.
            </p>
          )}
          <ul className="reportes">
            {abiertos.map((r, i) => (
              <li
                key={r.id}
                className={r.bloquea_clase ? "reporte bloquea" : "reporte"}
                style={{ "--i": i } as CSSProperties}
              >
                <div className="reporte-fila">
                  <span className={`tipo-icono ${r.tipo_falla}`}>
                    <Icono nombre={r.tipo_falla} />
                  </span>
                  <div className="reporte-cuerpo">
                    <div className="reporte-titulo">
                      <strong>{r.aula_nombre}</strong>
                      {r.aula_seccion && <span className="seccion-reporte">{r.aula_seccion}</span>}
                      <span>{ETIQUETA_FALLA[r.tipo_falla]}</span>
                      {r.bloquea_clase ? <span className="insignia roja">Bloquea la clase</span> : null}
                      {r.estado === "en_atencion" && <span className="insignia azul">En atención</span>}
                    </div>
                    <small>
                      Hace {duracion(minutosDesde(r.reportado_en))} · {r.origen === "qr" ? "por QR" : "por WhatsApp"}
                      {r.fotos > 0 ? ` · ${r.fotos === 1 ? "1 foto" : `${r.fotos} fotos`}` : ""}
                      {r.reportado_por_nombre ? ` · ${r.reportado_por_nombre}` : ""}
                    </small>
                    {r.descripcion && <p className="descripcion">“{r.descripcion}”</p>}
                    {r.fotos > 0 && <FotosReporte reporteId={r.id} total={r.fotos} />}
                  </div>
                </div>
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
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
