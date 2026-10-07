import { useEffect, useState } from "react";
import type { Ruta } from "../App";
import type { Metricas } from "../../shared/tipos";
import { api, NoAutorizado } from "../api";
import { duracion, ETIQUETA_FALLA } from "../formato";

const PERIODOS = [
  { dias: 7, etiqueta: "7 días" },
  { dias: 30, etiqueta: "30 días" },
  { dias: 90, etiqueta: "90 días" },
];

interface Props {
  onNoAutorizado: () => void;
  ir: (r: Ruta) => void;
}

interface Barra {
  clave: string;
  etiqueta: string;
  n: number;
  alPulsar?: () => void;
}

// Barras horizontales de una sola serie: el título nombra la medida, sin leyenda
function Barras({ titulo, filas, total }: { titulo: string; filas: Barra[]; total: number }) {
  const max = Math.max(1, ...filas.map((f) => f.n));
  return (
    <section className="tarjeta">
      <h2>{titulo}</h2>
      {filas.length === 0 && <p className="vacio">Sin datos en este periodo.</p>}
      <ul className="barras">
        {filas.map((f) => {
          const pct = total ? Math.round((f.n / total) * 100) : 0;
          const contenido = (
            <>
              <span className="barra-etiqueta">{f.etiqueta}</span>
              <span className="barra-pista">
                <span className="barra-relleno" style={{ width: `${(f.n / max) * 100}%` }} />
              </span>
              <span className="barra-valor">{f.n}</span>
            </>
          );
          const ayuda = `${f.etiqueta}: ${f.n} incidencias (${pct}% del total)`;
          return (
            <li key={f.clave}>
              {f.alPulsar ? (
                <button className="barra-fila" onClick={f.alPulsar} title={ayuda}>
                  {contenido}
                </button>
              ) : (
                <div className="barra-fila" title={ayuda}>
                  {contenido}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function Observatorio({ onNoAutorizado, ir }: Props) {
  const [dias, setDias] = useState(30);
  const [m, setM] = useState<Metricas | null>(null);

  useEffect(() => {
    api<Metricas>(`/api/metricas?dias=${dias}`)
      .then(setM)
      .catch((e) => (e instanceof NoAutorizado ? onNoAutorizado() : null));
  }, [dias, onNoAutorizado]);

  return (
    <div className="observatorio">
      <div className="filtros" role="group" aria-label="Periodo">
        {PERIODOS.map((p) => (
          <button key={p.dias} className={dias === p.dias ? "chip activo" : "chip"} onClick={() => setDias(p.dias)}>
            {p.etiqueta}
          </button>
        ))}
      </div>

      {!m ? (
        <p className="vacio">Cargando…</p>
      ) : (
        <>
          <section className="indicadores">
            <div className="indicador">
              <span>Incidencias</span>
              <strong>{m.resumen.total}</strong>
              <small>{m.resumen.abiertos ?? 0} abiertas</small>
            </div>
            <div className="indicador">
              <span>Bloquearon la clase</span>
              <strong>{m.resumen.bloqueantes ?? 0}</strong>
            </div>
            <div className="indicador">
              <span>Atención promedio</span>
              <strong>{duracion(m.resumen.prom_atencion_min)}</strong>
            </div>
            <div className="indicador">
              <span>Resolución promedio</span>
              <strong>{duracion(m.resumen.prom_resolucion_min)}</strong>
            </div>
          </section>

          <Barras
            titulo="Incidencias por tipo de falla"
            total={m.resumen.total}
            filas={m.por_tipo.map((t) => ({ clave: t.tipo_falla, etiqueta: ETIQUETA_FALLA[t.tipo_falla], n: t.n }))}
          />
          <Barras
            titulo="Aulas con más incidencias"
            total={m.resumen.total}
            filas={m.ranking_aulas.map((a) => ({
              clave: String(a.id),
              etiqueta: a.codigo,
              n: a.n,
              alPulsar: () => ir({ pantalla: "aula", id: a.id }),
            }))}
          />
        </>
      )}
    </div>
  );
}
