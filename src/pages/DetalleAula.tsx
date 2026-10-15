import { useEffect, useState } from "react";
import type { Ruta } from "../App";
import type { DetalleAula as Detalle } from "../../shared/tipos";
import { api, NoAutorizado } from "../api";
import FotosReporte from "../FotosReporte";
import { duracion, ETIQUETA_ESTADO, ETIQUETA_FALLA, fechaCorta, minutosEntre } from "../formato";

const SEMAFORO: Record<string, string> = {
  verde: "Operativa",
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

  const { aula, reportes, resumen } = detalle;

  return (
    <div className="detalle">
      <button className="volver" onClick={() => ir({ pantalla: "dashboard" })}>
        ← Dashboard
      </button>
      <header className="cabecera-aula">
        <h1>{aula.nombre}</h1>
        <span className={`etiqueta ${aula.semaforo}`}>
          <i className={`punto ${aula.semaforo}`} /> {SEMAFORO[aula.semaforo]}
        </span>
      </header>

      <section className="indicadores">
        <div className="indicador">
          <span>Incidencias</span>
          <strong>{resumen.total}</strong>
        </div>
        <div className="indicador">
          <span>Atención promedio</span>
          <strong>{duracion(resumen.prom_atencion_min)}</strong>
        </div>
        <div className="indicador">
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
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
