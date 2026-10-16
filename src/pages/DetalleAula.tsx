import { useEffect, useState } from "react";
import type { Ruta } from "../App";
import type { DetalleAula as Detalle } from "../../shared/tipos";
import { api, NoAutorizado } from "../api";
import Icono from "../Icono";
import FotosReporte from "../FotosReporte";
import { descripcionAula, duracion, ETIQUETA_ESTADO, ETIQUETA_FALLA, fechaCorta, minutosEntre } from "../formato";

// Cómo se lee cada paso en el historial de cambios
const PASO: Record<string, string> = {
  abierto: "Reportado",
  en_atencion: "En atención",
  escalado: "Escalado",
  resuelto: "Resuelto",
};
const quien = (email: string | null) => (email ? ` · ${email.split("@")[0]}` : "");

const SEMAFORO: Record<string, string> = {
  verde: "Sin reportes",
  amarillo: "Falla sin bloqueo",
  rojo: "Bloquea la clase",
};

interface Props {
  id: number;
  onNoAutorizado: () => void;
  ir: (r: Ruta) => void;
}

// Historial de un aula: sirve para justificar mantenimiento preventivo con datos
export default function DetalleAula({ id, onNoAutorizado, ir }: Props) {
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setDetalle(null);
    api<Detalle>(`/api/aulas/${id}`)
      .then(setDetalle)
      .catch((e) => (e instanceof NoAutorizado ? onNoAutorizado() : setError(true)));
  }, [id, onNoAutorizado]);

  if (error) return <p className="vacio">No se encontró el aula.</p>;
  if (!detalle) return <p className="vacio">Cargando…</p>;

  const { aula, reportes, resumen, eventos = [] } = detalle;

  return (
    <div className="detalle">
      <button className="volver" onClick={() => ir({ pantalla: "dashboard" })}>
        <Icono nombre="volver" /> Dashboard
      </button>
      <header className="cabecera-pagina">
        <div>
          <h1>{aula.nombre}</h1>
          {descripcionAula(aula) && <p className="subtitulo">{descripcionAula(aula)}</p>}
        </div>
        <span className={`etiqueta ${aula.semaforo}`}>
          <i className={`punto ${aula.semaforo}`} /> {SEMAFORO[aula.semaforo]}
        </span>
      </header>

      <section className="resumen">
        <div className="dato">
          <span>Incidencias</span>
          <strong>{resumen.total}</strong>
        </div>
        <div className="dato">
          <span>Atención promedio</span>
          <strong>{duracion(resumen.prom_atencion_min)}</strong>
        </div>
        <div className="dato">
          <span>Resolución promedio</span>
          <strong>{duracion(resumen.prom_resolucion_min)}</strong>
        </div>
      </section>

      <section className="tarjeta">
        <h2>Historial</h2>
        {reportes.length === 0 && <p className="vacio">Esta aula no tiene incidencias registradas.</p>}
        <ul className="historial">
          {reportes.map((r) => (
            <li key={r.id}>
              <div className="fila-historial">
                <strong>{ETIQUETA_FALLA[r.tipo_falla]}</strong>
                <span className={`estado ${r.estado}`}>{ETIQUETA_ESTADO[r.estado]}</span>
              </div>
              <small>
                {fechaCorta(r.reportado_en)}
                {r.bloquea_clase ? " · Bloqueó la clase" : ""}
                {r.reportado_por_nombre ? ` · ${r.reportado_por_nombre}` : ""}
                {r.resuelto_en ? ` · Resuelto en ${duracion(minutosEntre(r.reportado_en, r.resuelto_en))}` : ""}
              </small>
              {r.descripcion && <small>{r.descripcion}</small>}
              {r.fotos > 0 && <FotosReporte reporteId={r.id} total={r.fotos} />}
              {(r.causa || r.notas_resolucion) && (
                <p className="solucion">
                  {r.causa && <>Causa: {r.causa}<br /></>}
                  {r.notas_resolucion && <>Qué se hizo: {r.notas_resolucion}</>}
                </p>
              )}
              {(r.ticket_glpi || r.observaciones) && (
                <p className="solucion">
                  {r.ticket_glpi && <>Ticket GLPI: #{r.ticket_glpi}<br /></>}
                  {r.observaciones && <>Observaciones: {r.observaciones}</>}
                </p>
              )}
              {eventos.some((e) => e.reporte_id === r.id) && (
                <details className="cambios">
                  <summary>Historial de cambios</summary>
                  <ol>
                    {eventos
                      .filter((e) => e.reporte_id === r.id)
                      .map((e, i) => (
                        <li key={i}>
                          <span className={`estado ${e.estado}`}>{PASO[e.estado] ?? e.estado}</span>
                          <small>
                            {fechaCorta(e.en)}
                            {quien(e.email)}
                            {e.nota ? ` · ${e.nota}` : ""}
                          </small>
                        </li>
                      ))}
                  </ol>
                </details>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
