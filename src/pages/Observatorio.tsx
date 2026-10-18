import { useCallback, useEffect, useState } from "react";
import type { Ruta } from "../App";
import type { Metricas, Recurrente } from "../../shared/tipos";
import { api, NoAutorizado } from "../api";
import Icono from "../Icono";
import { useEnVivo } from "../useEnVivo";
import { duracion, ETIQUETA_FALLA, fechaCorta } from "../formato";

const ENTRADA: Record<string, string> = {
  qr: "QR impreso",
  escaner: "Escáner de /docente",
  lista: "Lista de /docente",
  whatsapp: "WhatsApp (vía TI)",
  presencial: "En persona (vía TI)",
  otro: "Otro canal (vía TI)",
};

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
function Barras({ titulo, filas, total, vacio }: { titulo: string; filas: Barra[]; total: number; vacio: string }) {
  const max = Math.max(1, ...filas.map((f) => f.n));
  return (
    <section className="tarjeta">
      <h2>{titulo}</h2>
      {filas.length === 0 && <p className="vacio">{vacio}</p>}
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

// Fecha AAAA-MM-DD de Lima para un instante
const diaLima = (d: Date) => new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 10);
const etiquetaDia = (dia: string, opciones: Intl.DateTimeFormatOptions) =>
  new Date(`${dia}T12:00:00Z`).toLocaleDateString("es-PE", { timeZone: "UTC", ...opciones });

// Columnas por día (7 y 30 días) o por semana (90 días), con los días sin reportes en cero
function Tendencia({ dias, datos }: { dias: number; datos: Metricas["por_dia"] }) {
  const porDia = new Map(datos.map((d) => [d.dia, d.n]));
  const hoy = new Date();
  const lista = Array.from({ length: dias }, (_, i) => diaLima(new Date(hoy.getTime() - (dias - 1 - i) * 86_400_000)));
  const semanal = dias > 31;
  const columnas: { clave: string; etiqueta: string; ayuda: string; n: number }[] = [];
  if (semanal) {
    for (let i = 0; i < lista.length; i += 7) {
      const tramo = lista.slice(i, i + 7);
      const n = tramo.reduce((s, d) => s + (porDia.get(d) ?? 0), 0);
      const desde = etiquetaDia(tramo[0], { day: "numeric", month: "short" });
      columnas.push({ clave: tramo[0], etiqueta: desde, ayuda: `Semana del ${desde}: ${n} incidencias`, n });
    }
  } else {
    for (const d of lista) {
      const n = porDia.get(d) ?? 0;
      columnas.push({
        clave: d,
        etiqueta: etiquetaDia(d, dias <= 7 ? { weekday: "short", day: "numeric" } : { day: "numeric", month: "short" }),
        ayuda: `${etiquetaDia(d, { weekday: "long", day: "numeric", month: "long" })}: ${n} incidencias`,
        n,
      });
    }
  }
  const max = Math.max(1, ...columnas.map((c) => c.n));
  const total = columnas.reduce((s, c) => s + c.n, 0);
  // En 30 días no caben todas las fechas: se muestra una de cada cinco
  const cada = columnas.length > 14 ? 5 : 1;
  return (
    <section className="tarjeta">
      <h2>Incidencias {semanal ? "por semana" : "por día"}</h2>
      {total === 0 ? (
        <p className="vacio">Aquí verás cuántas incidencias llegan cada {semanal ? "semana" : "día"} cuando se registren las primeras.</p>
      ) : (
        <>
          <div className="tendencia" role="img" aria-label={`${total} incidencias; el máximo fue ${max} en ${semanal ? "una semana" : "un día"}`}>
            <span className="tendencia-max">{max}</span>
            {columnas.map((c, i) => (
              <div key={c.clave} className="tendencia-col" data-ayuda={c.ayuda} tabIndex={0} aria-label={c.ayuda}>
                <span className="tendencia-barra" style={{ height: `${(c.n / max) * 100}%` }} data-vacia={c.n === 0 || undefined} />
                <small className={(columnas.length - 1 - i) % cada === 0 ? "" : "oculta"}>{c.etiqueta}</small>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

const ESTADOS: { clave: "resuelto" | "pendiente" | "escalado"; etiqueta: string }[] = [
  { clave: "resuelto", etiqueta: "Resueltas" },
  { clave: "pendiente", etiqueta: "Pendientes" },
  { clave: "escalado", etiqueta: "Escaladas a GLPI" },
];

// Cómo quedaron las incidencias del periodo: una barra apilada con su leyenda y números
function Estados({ datos, escaladas }: { datos: Metricas["por_estado"]; escaladas: number }) {
  const n = (clave: string) => datos.find((d) => d.estado === clave)?.n ?? 0;
  const total = ESTADOS.reduce((s, e) => s + n(e.clave), 0);
  return (
    <section className="tarjeta">
      <h2>Cómo quedaron</h2>
      {total === 0 ? (
        <p className="vacio">Aquí verás cuántas se resolvieron, siguen pendientes o se escalaron a GLPI.</p>
      ) : (
        <>
          <div className="apilada" role="img" aria-label={ESTADOS.map((e) => `${e.etiqueta}: ${n(e.clave)}`).join(", ")}>
            {ESTADOS.filter((e) => n(e.clave) > 0).map((e) => (
              <span key={e.clave} className={`tramo ${e.clave}`} style={{ flexGrow: n(e.clave) }} title={`${e.etiqueta}: ${n(e.clave)}`} />
            ))}
          </div>
          <ul className="leyenda-estados">
            {ESTADOS.map((e) => (
              <li key={e.clave}>
                <i className={`muestra-estado ${e.clave}`} />
                {e.etiqueta}
                <strong>{n(e.clave)}</strong>
                <small>{Math.round((n(e.clave) / total) * 100)}%</small>
              </li>
            ))}
          </ul>
          {escaladas > n("escalado") && (
            <p className="nota-seccion pie">
              En el periodo se escalaron {escaladas} a GLPI; {escaladas - n("escalado")} ya se resolvieron.
            </p>
          )}
        </>
      )}
    </section>
  );
}

// Asistencia guiada: de las veces que el docente vio los pasos de una ficha en el QR,
// cuántas lo resolvió solo y cuántas igual tuvo que avisar a TI
function Autosolucion({ datos }: { datos: Metricas["autosolucion"] }) {
  const total = datos.resueltas + datos.avisaron;
  const porcentaje = total ? Math.round((datos.resueltas / total) * 100) : 0;
  return (
    <section className="tarjeta">
      <h2>Autosolución docente</h2>
      <p className="nota-seccion">
        Veces que el docente vio en el QR los pasos de una ficha. Si con eso funcionó, TI no recibió reporte.
      </p>
      {total === 0 ? (
        <p className="vacio">
          Aquí verás cuántas fallas resolvieron los docentes con los pasos de las fichas. Para que aparezcan, llena “Qué
          puede probar el docente” en la Base de conocimiento.
        </p>
      ) : (
        <>
          <div className="apilada" role="img" aria-label={`Resueltas por el docente: ${datos.resueltas}; avisaron a TI: ${datos.avisaron}`}>
            {datos.resueltas > 0 && <span className="tramo resuelto" style={{ flexGrow: datos.resueltas }} />}
            {datos.avisaron > 0 && <span className="tramo avisaron" style={{ flexGrow: datos.avisaron }} />}
          </div>
          <ul className="leyenda-estados">
            <li>
              <i className="muestra-estado resuelto" />
              Lo resolvió el docente
              <strong>{datos.resueltas}</strong>
              <small>{porcentaje}%</small>
            </li>
            <li>
              <i className="muestra-estado avisaron" />
              Igual avisó a TI
              <strong>{datos.avisaron}</strong>
              <small>{100 - porcentaje}%</small>
            </li>
          </ul>
        </>
      )}
    </section>
  );
}

// Todas las veces con la misma causa: el desperfecto vuelve
function causaRepetida(r: Recurrente): boolean {
  return r.causas.length === 1 && r.con_causa === r.n;
}

function leerCausas(r: Recurrente): string {
  if (r.con_causa === 0) return "Sin causa registrada todavía";
  if (causaRepetida(r)) return `Misma causa las ${r.n} veces: ${r.causas[0]}`;
  const sin = r.n - r.con_causa;
  const resto = sin > 0 ? ` · ${sin} sin causa` : "";
  if (r.causas.length === 1) return `Causa: ${r.causas[0]}${resto}`;
  return `${r.causas.length} causas distintas: ${r.causas.join(" · ")}${resto}`;
}

export default function Observatorio({ onNoAutorizado, ir }: Props) {
  const [dias, setDias] = useState(30);
  const [m, setM] = useState<Metricas | null>(null);

  const cargar = useCallback(() => {
    api<Metricas>(`/api/metricas?dias=${dias}`)
      .then(setM)
      .catch((e) => (e instanceof NoAutorizado ? onNoAutorizado() : null));
  }, [dias, onNoAutorizado]);

  useEffect(cargar, [cargar]);
  useEnVivo((evento) => {
    if (!evento || evento.tipo === "cambio") cargar();
  });

  return (
    <div className="observatorio">
      <header className="cabecera-pagina">
        <div>
          <h1>Observatorio</h1>
          <p className="subtitulo">Cómo van las incidencias de la sede.</p>
        </div>
        <div className="segmentado compacto" role="group" aria-label="Periodo">
          {PERIODOS.map((p) => (
            <button key={p.dias} className={dias === p.dias ? "activo" : ""} onClick={() => setDias(p.dias)}>
              {p.etiqueta}
            </button>
          ))}
        </div>
      </header>

      {!m ? (
        <p className="vacio">Cargando…</p>
      ) : (
        <>
          <section className="resumen">
            <div className="dato">
              <span>Incidencias</span>
              <strong>{m.resumen.total}</strong>
              <small>{m.resumen.abiertos ?? 0} sin resolver</small>
            </div>
            <div className="dato">
              <span>Bloquearon la clase</span>
              <strong>{m.resumen.bloqueantes ?? 0}</strong>
            </div>
            <div className="dato">
              <span>Atención promedio</span>
              <strong>{duracion(m.resumen.prom_atencion_min)}</strong>
            </div>
            <div className="dato">
              <span>Resolución promedio</span>
              <strong>{duracion(m.resumen.prom_resolucion_min)}</strong>
            </div>
          </section>

          <Tendencia dias={dias} datos={m.por_dia} />
          <Estados datos={m.por_estado} escaladas={m.resumen.escalados ?? 0} />
          <Autosolucion datos={m.autosolucion} />

          <section className="tarjeta">
            <h2>Fallas que se repiten</h2>
            <p className="nota-seccion">
              La misma falla 3 veces o más en un aula durante el periodo. Si la causa se repite, el desperfecto está volviendo
              y conviene revisar el equipo; si las causas son distintas, pueden ser problemas diferentes.
            </p>
            {m.recurrentes.length === 0 ? (
              <p className="vacio">Ninguna falla se repitió 3 veces en la misma aula en este periodo.</p>
            ) : (
              <ul className="recurrentes">
                {m.recurrentes.map((r) => (
                  <li key={`${r.id}-${r.tipo_falla}`}>
                    <button onClick={() => ir({ pantalla: "aula", id: r.id })}>
                      <span className={`tipo-icono ${r.tipo_falla}`}>
                        <Icono nombre={r.tipo_falla} />
                      </span>
                      <span>
                        <strong>
                          {r.nombre} · {ETIQUETA_FALLA[r.tipo_falla]}
                        </strong>
                        <small className={causaRepetida(r) ? "causas-rec misma" : "causas-rec"}>{leerCausas(r)}</small>
                        <small>Última: {fechaCorta(r.ultima)}</small>
                      </span>
                      <span className="veces">{r.n} veces</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Barras
            vacio="Aquí verás qué fallas son más comunes cuando se registren las primeras incidencias."
            titulo="Incidencias por tipo de falla"
            total={m.resumen.total}
            filas={m.por_tipo.map((t) => ({ clave: t.tipo_falla, etiqueta: ETIQUETA_FALLA[t.tipo_falla], n: t.n }))}
          />
          <Barras
            vacio="Aquí verás si los reportes llegan más por el QR, por /docente o por WhatsApp."
            titulo="Por dónde llegan los reportes"
            total={m.resumen.total}
            filas={m.por_entrada.map((e) => ({ clave: e.entrada, etiqueta: ENTRADA[e.entrada] ?? e.entrada, n: e.n }))}
          />
          <Barras
            vacio="Aquí verás las cinco aulas con más incidencias del periodo."
            titulo="Las 5 aulas con más incidencias"
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
