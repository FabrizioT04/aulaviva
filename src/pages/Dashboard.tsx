import { type CSSProperties, useCallback, useEffect, useState } from "react";
import type { AulaConEstado, Metricas, Reporte, TipoFalla } from "../../shared/tipos";
import type { Ruta } from "../App";
import { api, NoAutorizado } from "../api";
import Contador from "../Contador";
import FormEscalar from "../FormEscalar";
import FormResolver from "../FormResolver";
import FotosReporte from "../FotosReporte";
import Icono from "../Icono";
import { canal, descripcionAula, duracion, ETIQUETA_FALLA, minutosDesde } from "../formato";
import { useEnVivo } from "../useEnVivo";
import { AreaSemanas, Dona, MiniLinea, type Porcion, type PuntoSemana } from "../Graficos";

// Fecha AAAA-MM-DD de Lima para un instante
const diaLima = (d: Date) => new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 10);
const fechaCorta = (d: Date) =>
  d.toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");

// Reportes por día de los últimos `dias` días (los días sin reportes en cero), del más antiguo al de hoy
function serieDiaria(porDia: Metricas["por_dia"], dias: number) {
  const n = new Map(porDia.map((d) => [d.dia, d.n]));
  const hoy = Date.now();
  return Array.from({ length: dias }, (_, i) => {
    const dia = diaLima(new Date(hoy - (dias - 1 - i) * 86_400_000));
    return { dia, n: n.get(dia) ?? 0 };
  });
}

// Semanas de 7 días que terminan hoy
function semanas(diaria: { dia: string; n: number }[]): PuntoSemana[] {
  const res: PuntoSemana[] = [];
  for (let i = 0; i + 7 <= diaria.length; i += 7) {
    const tramo = diaria.slice(i, i + 7);
    const ini = new Date(`${tramo[0].dia}T00:00:00Z`);
    const fin = new Date(`${tramo[6].dia}T00:00:00Z`);
    res.push({
      etiqueta: fechaCorta(ini),
      rango: `${fechaCorta(ini)} – ${fechaCorta(fin)}`,
      n: tramo.reduce((s, d) => s + d.n, 0),
    });
  }
  return res;
}

const SEMANAS = 12;

interface Props {
  onNoAutorizado: () => void;
  ir: (r: Ruta) => void;
  soloLectura?: boolean; // COA: ve los reportes pero no los atiende
}

export default function Dashboard({ onNoAutorizado, ir, soloLectura }: Props) {
  const [aulas, setAulas] = useState<AulaConEstado[]>([]);
  const [abiertos, setAbiertos] = useState<Reporte[]>([]);
  // Reporte con un formulario abierto: resolver o escalar
  const [abierto, setAbierto] = useState<{ id: number; accion: "resolver" | "escalar" } | null>(null);
  const [mes, setMes] = useState<Metricas | null>(null); // últimos 30 días
  const [trimestre, setTrimestre] = useState<Metricas | null>(null); // últimas 12 semanas, para la tendencia
  // Hora de los últimos datos recibidos, para mostrarla si se corta la conexión en vivo
  const [actualizado, setActualizado] = useState<Date | null>(null);

  const cargarReportes = useCallback(() => {
    api<Reporte[]>("/api/reportes?estado=abiertos")
      .then((r) => {
        setAbiertos(r);
        setActualizado(new Date());
      })
      .catch((e) => (e instanceof NoAutorizado ? onNoAutorizado() : null));
  }, [onNoAutorizado]);

  const cargarTodo = useCallback(() => {
    api<AulaConEstado[]>("/api/aulas")
      .then(setAulas)
      .catch((e) => (e instanceof NoAutorizado ? onNoAutorizado() : null));
    cargarReportes();
    api<Metricas>("/api/metricas?dias=30").then(setMes).catch(() => null);
    api<Metricas>(`/api/metricas?dias=${SEMANAS * 7}`).then(setTrimestre).catch(() => null);
  }, [cargarReportes, onNoAutorizado]);

  useEffect(cargarTodo, [cargarTodo]);

  // Cada cambio de un aula llega al instante; al reconectar o volver a la pestaña se recarga todo
  const conectado = useEnVivo((evento) => {
    if (!evento) return cargarTodo();
    if (evento.tipo !== "cambio") return;
    setAulas((prev) => prev.map((a) => (a.id === evento.aula.id ? evento.aula : a)));
    cargarReportes();
  });

  async function atender(reporte: Reporte) {
    try {
      await api(`/api/reportes/${reporte.id}`, { method: "PATCH", body: JSON.stringify({ estado: "en_atencion" }) });
      cargarTodo();
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
      setAbierto(null);
      cargarTodo();
    } catch (e) {
      if (e instanceof NoAutorizado) return onNoAutorizado();
      throw e;
    }
  }

  async function escalar(reporte: Reporte, ticket: string, observaciones: string) {
    try {
      await api(`/api/reportes/${reporte.id}`, {
        method: "PATCH",
        body: JSON.stringify({ estado: "escalado", ticket_glpi: ticket, observaciones }),
      });
      setAbierto(null);
      cargarTodo();
    } catch (e) {
      if (e instanceof NoAutorizado) return onNoAutorizado();
      throw e;
    }
  }

  const bloqueantes = abiertos.filter((r) => r.bloquea_clase);
  const enAtencion = abiertos.filter((r) => r.estado === "en_atencion").length;
  const escalados = abiertos.filter((r) => r.estado === "escalado").length;
  const operativas = aulas.filter((a) => a.semaforo === "verde").length;
  const pisos = [...new Set(aulas.map((a) => a.piso))].sort((a, b) => (a ?? 99) - (b ?? 99));
  const diaria = trimestre ? serieDiaria(trimestre.por_dia, SEMANAS * 7) : [];
  const porSemana = semanas(diaria);
  const ultimos14 = diaria.slice(-14).map((d) => d.n);
  const estaSemana = diaria.slice(-7).reduce((s, d) => s + d.n, 0);
  const anterior = diaria.slice(-14, -7).reduce((s, d) => s + d.n, 0);
  const cambio = anterior ? Math.round(((estaSemana - anterior) / anterior) * 100) : null;
  const resueltos30 = mes?.por_estado.find((e) => e.estado === "resuelto")?.n ?? 0;
  const total30 = mes?.resumen.total ?? 0;
  // Dona: los 3 tipos con más reportes y el resto junto
  const tipos = [...(mes?.por_tipo ?? [])].sort((a, b) => b.n - a.n);
  const porciones: Porcion[] = tipos.slice(0, 3).map((t) => ({ clave: t.tipo_falla, etiqueta: ETIQUETA_FALLA[t.tipo_falla], n: t.n }));
  const resto = tipos.slice(3).reduce((s, t) => s + t.n, 0);
  if (resto) porciones.push({ clave: "resto", etiqueta: `Resto (${tipos.length - 3} tipos)`, n: resto });
  const hoy = new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Lima" });

  return (
    <div className="dashboard">
      <header className="cabecera-pagina">
        <div>
          <p className="antetitulo">{hoy.charAt(0).toUpperCase() + hoy.slice(1)}</p>
          <h1>Estado de las aulas</h1>
        </div>
        <div className="acciones">
          <span
            className={conectado ? "en-vivo" : "en-vivo desconectado"}
            title={conectado ? "Se actualiza solo cuando llega o cambia un reporte" : undefined}
          >
            <i />{" "}
            {conectado
              ? "En vivo"
              : `Reconectando…${actualizado ? ` · datos de las ${actualizado.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}` : ""}`}
          </span>
          {!soloLectura && (
            <button className="primario" onClick={() => ir({ pantalla: "registro" })}>
              <Icono nombre="registrar" /> Registrar incidencia
            </button>
          )}
        </div>
      </header>

      <section className="resumen kpis" aria-label="Resumen">
        <div className="dato">
          <span>Reportes abiertos</span>
          <strong className="num"><Contador valor={abiertos.length} /></strong>
          <small>
            {enAtencion === 1 ? "1 en atención" : `${enAtencion} en atención`}
            {escalados > 0 ? ` · ${escalados === 1 ? "1 escalado" : `${escalados} escalados`}` : ""}
          </small>
          <span className="estados" aria-hidden="true">
            <span className="abierto" style={{ flexGrow: abiertos.length - enAtencion - escalados }} />
            <span className="en-atencion" style={{ flexGrow: enAtencion }} />
            <span className="escalado" style={{ flexGrow: escalados }} />
          </span>
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
          <span className="dato-titulo">
            Últimos 7 días
            {cambio != null && (
              <span className="variacion" title={`La semana anterior: ${anterior}`}>
                {cambio > 0 ? "▲" : cambio < 0 ? "▼" : "="} {Math.abs(cambio)}%
              </span>
            )}
          </span>
          <strong className="num"><Contador valor={estaSemana} /></strong>
          <MiniLinea valores={ultimos14} etiqueta={`Reportes por día en las últimas dos semanas: ${ultimos14.join(", ")}`} />
        </div>
        <div className="dato destacado">
          <span>Atención promedio</span>
          <strong className="num">{duracion(mes?.resumen.prom_atencion_min)}</strong>
          <small>Resolución: {duracion(mes?.resumen.prom_resolucion_min)} · 30 días</small>
        </div>
      </section>

      <div className="analitica">
        <section className="tarjeta">
          <div className="tarjeta-cabecera">
            <div>
              <h2>Reportes por semana</h2>
              <span className="nota">Últimas {SEMANAS} semanas</span>
            </div>
            <div className="cifras">
              <span>
                <strong className="num">{porSemana.reduce((s, d) => s + d.n, 0)}</strong> reportes
              </span>
              <span>
                <strong className="num">{resueltos30}</strong> de {total30} resueltos en 30 días
              </span>
            </div>
          </div>
          {trimestre && <AreaSemanas datos={porSemana} />}
        </section>

        <section className="tarjeta">
          <div className="tarjeta-cabecera">
            <div>
              <h2>Por tipo de falla</h2>
              <span className="nota">Últimos 30 días</span>
            </div>
            <button className="enlace" onClick={() => ir({ pantalla: "observatorio" })}>
              Ver más
            </button>
          </div>
          {total30 === 0 ? (
            <p className="vacio">Aquí verás qué fallas llegan más cuando se registren reportes.</p>
          ) : (
            <>
              <Dona porciones={porciones} total={total30} centro="Reportes" />
              <ul className="leyenda-dona">
                {porciones.map((p, i) => (
                  <li key={p.clave}>
                    <i className={`tono-${i}`} />
                    <span className="leyenda-icono">{p.clave !== "resto" && <Icono nombre={p.clave as TipoFalla} />}</span>
                    <span>{p.etiqueta}</span>
                    <strong className="num">{p.n}</strong>
                    <small className="num">{Math.round((p.n / total30) * 100)}%</small>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <div className="columnas">
        <section className="tarjeta">
          <div className="tarjeta-cabecera">
            <div>
              <h2>Mapa de aulas</h2>
              <span className="nota" title="Aulas sin reportes abiertos. No quiere decir que se hayan revisado en persona.">
                {operativas} de {aulas.length} sin reportes
              </span>
            </div>
            <div className="leyenda">
              <span><i className="muestra verde" /> Sin reportes</span>
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
              <Icono nombre="check" /> No hay reportes abiertos.
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
                      {r.estado === "escalado" && (
                        <span className="insignia escalado">Escalado{r.ticket_glpi ? ` · GLPI #${r.ticket_glpi}` : ""}</span>
                      )}
                    </div>
                    <small>
                      Hace {duracion(minutosDesde(r.reportado_en))} · {canal(r)}
                      {r.fotos > 0 ? ` · ${r.fotos === 1 ? "1 foto" : `${r.fotos} fotos`}` : ""}
                      {r.reportado_por_nombre ? ` · ${r.reportado_por_nombre}` : ""}
                    </small>
                    {r.descripcion && <p className="descripcion">“{r.descripcion}”</p>}
                    {r.ficha_vista && <p className="ficha-vista">El docente ya vio los pasos de “{r.ficha_vista}”</p>}
                    {r.observaciones && <p className="observacion">Obs.: {r.observaciones}</p>}
                    {r.fotos > 0 && <FotosReporte reporteId={r.id} total={r.fotos} />}
                  </div>
                </div>
                {abierto?.id === r.id && abierto.accion === "resolver" ? (
                  <FormResolver
                    reporteId={r.id}
                    aulaId={r.aula_id}
                    onGuardar={(causa, hice) => resolver(r, causa, hice)}
                    onCancelar={() => setAbierto(null)}
                  />
                ) : abierto?.id === r.id && abierto.accion === "escalar" ? (
                  <FormEscalar onGuardar={(ticket, obs) => escalar(r, ticket, obs)} onCancelar={() => setAbierto(null)} />
                ) : soloLectura ? null : (
                  <div className="acciones">
                    {r.estado === "abierto" && <button onClick={() => atender(r)}>Atender</button>}
                    {r.estado !== "escalado" && <button onClick={() => setAbierto({ id: r.id, accion: "escalar" })}>Escalar</button>}
                    <button className="primario" onClick={() => setAbierto({ id: r.id, accion: "resolver" })}>
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
