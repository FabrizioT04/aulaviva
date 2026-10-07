import { useCallback, useEffect, useState } from "react";
import type { AulaConEstado, EventoEnVivo, Reporte } from "../../shared/tipos";
import type { Ruta } from "../App";
import { api, NoAutorizado, urlEnVivo } from "../api";
import { duracion, ETIQUETA_FALLA, minutosDesde } from "../formato";

interface Props {
  onNoAutorizado: () => void;
  ir: (r: Ruta) => void;
}

export default function Dashboard({ onNoAutorizado, ir }: Props) {
  const [aulas, setAulas] = useState<AulaConEstado[]>([]);
  const [abiertos, setAbiertos] = useState<Reporte[]>([]);
  const [conectado, setConectado] = useState(false);

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

  async function cambiarEstado(reporte: Reporte, estado: "en_atencion" | "resuelto") {
    let notas: string | null = null;
    if (estado === "resuelto") {
      notas = prompt("¿Cómo se resolvió? (esto alimentará el asistente del Sprint 3)");
      if (notas === null) return;
    }
    try {
      await api(`/api/reportes/${reporte.id}`, {
        method: "PATCH",
        body: JSON.stringify({ estado, notas_resolucion: notas }),
      });
    } catch (e) {
      if (e instanceof NoAutorizado) onNoAutorizado();
    }
  }

  return (
    <div className="dashboard">
      <div className="cabecera-dashboard">
        <p className={conectado ? "en-vivo" : "en-vivo desconectado"}>
          {conectado ? "● En vivo" : "○ Reconectando…"}
        </p>
        <button className="enlace" onClick={() => ir({ pantalla: "qr" })}>
          QR de aulas
        </button>
      </div>

      <div className="leyenda">
        <span><i className="punto verde" /> Operativa</span>
        <span><i className="punto amarillo" /> Falla sin bloqueo</span>
        <span><i className="punto rojo" /> Bloquea la clase</span>
      </div>
      <section className="grilla">
        {aulas.map((a) => (
          <button
            key={a.id}
            className={`aula ${a.semaforo}`}
            onClick={() => ir({ pantalla: "aula", id: a.id })}
            aria-label={`${a.nombre}: ${a.reportes_abiertos} reportes abiertos`}
          >
            <strong>{a.codigo}</strong>
            {a.reportes_abiertos > 0 && <span>{a.reportes_abiertos}</span>}
          </button>
        ))}
      </section>

      <section className="tarjeta">
        <h2>Reportes abiertos ({abiertos.length})</h2>
        {abiertos.length === 0 && <p className="vacio">Todas las aulas operativas.</p>}
        <ul className="reportes">
          {abiertos.map((r) => (
            <li key={r.id} className={r.bloquea_clase ? "bloquea" : ""}>
              <div>
                <strong>{r.aula_nombre}</strong> · {ETIQUETA_FALLA[r.tipo_falla]}
                {r.bloquea_clase ? " · Bloquea la clase" : ""}
                <small>
                  Hace {duracion(minutosDesde(r.reportado_en))}
                  {r.reportado_por_nombre ? ` · ${r.reportado_por_nombre}` : ""}
                  {r.estado === "en_atencion" ? " · En atención" : ""}
                </small>
                {r.descripcion && <small>{r.descripcion}</small>}
              </div>
              <div className="acciones">
                {r.estado === "abierto" && <button onClick={() => cambiarEstado(r, "en_atencion")}>Atender</button>}
                <button className="primario" onClick={() => cambiarEstado(r, "resuelto")}>
                  Resolver
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
