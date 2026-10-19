import { useCallback, useEffect, useState } from "react";
import { HALLAZGOS, type AulaMl, type DatosMonitoreo, type Hallazgo, type Monitoreo as Ronda } from "../../shared/monitoreo";
import { api, leerToken, NoAutorizado } from "../api";
import { comprimir } from "../comprimir";
import { csvRondas } from "../csv";
import { duracion, minutosEntre } from "../formato";
import FotosReporte from "../FotosReporte";
import Icono from "../Icono";

interface Props {
  onNoAutorizado: () => void;
}

const nombreAula = (a: { nombre: string; seccion: string | null }) => `${a.nombre}${a.seccion ? ` · ${a.seccion}` : ""}`;
const nombreRonda = (r: Ronda) => nombreAula({ nombre: r.aula_nombre, seccion: r.aula_seccion });

// 2 → "2do piso", 3 → "3er piso"
function nombrePiso(piso: number | null): string {
  if (piso == null) return "Sin piso";
  const sufijo = piso === 1 || piso === 3 ? "er" : piso === 2 ? "do" : "to";
  return `${piso}${sufijo} piso`;
}

const LIMA = { timeZone: "America/Lima" } as const;
const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-PE", { ...LIMA, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dia = (iso: string) => {
  const t = new Date(iso).toLocaleDateString("es-PE", { ...LIMA, weekday: "short", day: "2-digit", month: "2-digit" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
// "HH:MM" de hoy en Lima → ISO, para cuando se olvidó terminar la ronda a tiempo
function horaAIso(hhmm: string, inicio: string): string {
  const fecha = new Date(inicio).toLocaleDateString("sv-SE", LIMA);
  return new Date(`${fecha}T${hhmm}:00-05:00`).toISOString();
}

// Igual que HORA_TARDE en worker/monitoreo.ts: antes de la 1 p. m. es la foto de la mañana
const HORA_TARDE = 13;
const horaLimaAhora = () => Number(new Date().toLocaleString("en-US", { ...LIMA, hour: "numeric", hourCycle: "h23" }));

// Más de esto abierta, probablemente se olvidó de terminarla: se pregunta a qué hora terminó
const RONDA_LARGA_MIN = 120;

// Las rondas de TI en los laboratorios ML, donde están las Chromebooks: empezar al llegar al aula,
// marcar lo que encuentra y terminar al salir. Solo la ve quien hace las rondas (MONITOREO_EMAILS).
export default function Monitoreo({ onNoAutorizado }: Props) {
  const [d, setD] = useState<DatosMonitoreo | null>(null);
  const [hallazgos, setHallazgos] = useState<Hallazgo[]>([]);
  const [nota, setNota] = useState("");
  const [finManual, setFinManual] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [, setTic] = useState(0);

  const fallo = useCallback(
    (e: unknown) => {
      if (e instanceof NoAutorizado) onNoAutorizado();
      else setError(e instanceof Error ? e.message : "No se pudo guardar");
    },
    [onNoAutorizado],
  );

  const cargar = useCallback(
    () =>
      api<DatosMonitoreo>("/api/monitoreo")
        .then((datos) => {
          setD(datos);
          setHallazgos(datos.activo?.hallazgos ?? []);
          setNota(datos.activo?.nota ?? "");
          setFinManual("");
        })
        .catch(fallo),
    [fallo],
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  // El tiempo de la ronda en curso avanza solo
  useEffect(() => {
    const t = setInterval(() => setTic((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  async function accion(hacer: () => Promise<unknown>) {
    setOcupado(true);
    setError("");
    try {
      await hacer();
      await cargar();
    } catch (e) {
      fallo(e);
    } finally {
      setOcupado(false);
    }
  }

  const activo = d?.activo ?? null;
  const transcurrido = activo ? minutosEntre(activo.inicio, new Date().toISOString()) ?? 0 : 0;
  const larga = transcurrido > RONDA_LARGA_MIN;

  const guardar = (cambios: Record<string, unknown>) =>
    activo ? api(`/api/monitoreo/${activo.id}`, { method: "PATCH", body: JSON.stringify(cambios) }) : Promise.resolve();

  function alternar(h: Hallazgo) {
    const lista = hallazgos.includes(h) ? hallazgos.filter((x) => x !== h) : [...hallazgos, h];
    setHallazgos(lista);
    guardar({ hallazgos: lista }).catch(fallo);
  }

  const empezar = (aula: AulaMl) =>
    accion(async () => {
      // Al pasar a otra aula, la ronda actual se guarda con lo marcado y termina ahora
      if (activo) await guardar({ hallazgos, nota });
      await api("/api/monitoreo", { method: "POST", body: JSON.stringify({ aula_id: aula.id }) });
    });

  const terminar = () =>
    accion(() =>
      guardar({ hallazgos, nota, terminar: true, ...(larga && finManual && activo ? { fin: horaAIso(finManual, activo.inicio) } : {}) }),
    );

  async function subirFotos(lista: FileList | null) {
    if (!activo || !lista?.length) return;
    setSubiendo(true);
    setError("");
    const token = leerToken();
    let fallidas = 0;
    for (const archivo of [...lista]) {
      const foto = await comprimir(archivo).catch(() => archivo);
      const res = await fetch(`/api/monitoreo/${activo.id}/foto`, {
        method: "PUT",
        headers: { "Content-Type": foto.type || "image/jpeg", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: foto,
      }).catch(() => null);
      if (!res?.ok) fallidas++;
    }
    if (fallidas) setError(fallidas === 1 ? "Una foto no se pudo subir." : `${fallidas} fotos no se pudieron subir.`);
    setSubiendo(false);
    await cargar();
  }

  const descartar = () => accion(() => (activo ? api(`/api/monitoreo/${activo.id}`, { method: "DELETE" }) : Promise.resolve()));

  const pisos = [...new Set((d?.aulas ?? []).map((a) => a.piso))];
  const turnoTarde = horaLimaAhora() >= HORA_TARDE;

  return (
    <div className="pagina-monitoreo">
      <header className="cabecera-pagina">
        <div>
          <h1>Monitoreo ML</h1>
          <p className="subtitulo">Tus rondas en los laboratorios con Chromebooks. Solo tú ves esta pestaña.</p>
        </div>
      </header>

      {error && <p className="aviso error">{error}</p>}
      {!d ? (
        <p className="vacio">Cargando…</p>
      ) : (
        <>
          <section className="tarjeta fotos-hoy" aria-label="Fotos de hoy">
            <h2>Fotos de hoy</h2>
            <p className="pista">Al menos una por piso en la mañana y otra en la tarde (desde la 1 p. m.).</p>
            <ul>
              <li className="encabezado" aria-hidden="true">
                <span />
                <span>Mañana</span>
                <span>Tarde</span>
              </li>
              {pisos.map((piso) => {
                const f = d.fotos_hoy.find((x) => x.piso === piso);
                const turnos = [
                  { nombre: "Mañana", n: f?.manana ?? 0, pasado: turnoTarde },
                  { nombre: "Tarde", n: f?.tarde ?? 0, pasado: false },
                ];
                return (
                  <li key={piso ?? "sin-piso"}>
                    <strong>{nombrePiso(piso)}</strong>
                    {turnos.map((t) => (
                      <span key={t.nombre} className={`turno ${t.n ? "hecho" : t.pasado ? "falto" : ""}`}>
                        {t.n ? <Icono nombre="check" /> : null}
                        <span className="solo-lector">{t.nombre}: </span>
                        {t.n ? `${t.n} ${t.n === 1 ? "foto" : "fotos"}` : t.pasado ? "Faltó" : "Pendiente"}
                      </span>
                    ))}
                  </li>
                );
              })}
            </ul>
          </section>

          {activo ? (
            <section className="tarjeta ronda-activa" aria-live="polite">
              <div className="ronda-cabeza">
                <span className="punto-vivo" aria-hidden="true" />
                <div>
                  <small>Monitoreando</small>
                  <h2>{nombreRonda(activo)}</h2>
                  <p>
                    Desde las {hora(activo.inicio)} · {duracion(transcurrido)}
                  </p>
                </div>
              </div>

              <fieldset>
                <legend>¿Qué encontraste?</legend>
                <div className="chips">
                  {(Object.keys(HALLAZGOS) as Hallazgo[]).map((h) => (
                    <button key={h} type="button" className={`chip ${hallazgos.includes(h) ? "activo" : ""}`} aria-pressed={hallazgos.includes(h)} onClick={() => alternar(h)}>
                      {HALLAZGOS[h]}
                    </button>
                  ))}
                </div>
                <small className="pista">Si no marcas nada, la ronda queda como «Todo en orden».</small>
              </fieldset>

              <div className="fotos-ronda">
                <span className="etiqueta-campo">Fotos</span>
                {activo.fotos > 0 && <FotosReporte reporteId={activo.id} total={activo.fotos} ruta={`/api/monitoreo/${activo.id}/fotos`} />}
                <label className={`boton-foto ${subiendo || activo.fotos >= 6 ? "deshabilitado" : ""}`}>
                  <Icono nombre="camara" />
                  {subiendo ? "Subiendo…" : activo.fotos ? "Tomar otra foto" : "Tomar foto del aula"}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    hidden
                    disabled={subiendo || activo.fotos >= 6}
                    onChange={(e) => {
                      subirFotos(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>

              <label>
                Nota (opcional)
                <textarea
                  rows={2}
                  value={nota}
                  maxLength={1000}
                  onChange={(e) => setNota(e.target.value)}
                  onBlur={() => guardar({ nota }).catch(fallo)}
                  placeholder="Ej. Dos alumnos de 10B en juegos; le avisé al docente"
                />
              </label>

              {larga && (
                <label className="fin-manual">
                  ¿A qué hora terminaste? Lleva {duracion(transcurrido)} abierta.
                  <input type="time" value={finManual} onChange={(e) => setFinManual(e.target.value)} />
                </label>
              )}

              <button className="primario terminar" disabled={ocupado} onClick={terminar}>
                <Icono nombre="check" />
                Terminar monitoreo
              </button>
              <div className="pasar-a">
                <span>¿Te vas a otra aula? Esta ronda termina y empieza la otra:</span>
                <div className="chips">
                  {d.aulas
                    .filter((a) => a.id !== activo.aula_id)
                    .map((a) => (
                      <button key={a.id} className="chip" disabled={ocupado} onClick={() => empezar(a)}>
                        {a.nombre}
                      </button>
                    ))}
                </div>
              </div>
              <button className="enlace peligro descartar" disabled={ocupado} onClick={descartar}>
                Descartar esta ronda
              </button>
            </section>
          ) : (
            <section className="aulas-ml">
              {pisos.map((piso) => (
                <div key={piso ?? "sin-piso"} className="piso-ml">
                  <h2>{nombrePiso(piso)}</h2>
                  <div className="botones-ml">
                    {d.aulas
                      .filter((a) => a.piso === piso)
                      .map((a) => (
                        <button key={a.id} className="aula-ml" disabled={ocupado} onClick={() => empezar(a)}>
                          <Icono nombre="chromebook" />
                          <strong>{nombreAula(a)}</strong>
                          <span>Empezar monitoreo</span>
                        </button>
                      ))}
                  </div>
                </div>
              ))}
              {d.aulas.length === 0 && <p className="vacio">No hay aulas con "ML" en la sección.</p>}
            </section>
          )}

          <section className="resumen">
            <div className="dato">
              <span>Hoy</span>
              <strong>{d.hoy.rondas}</strong>
              <small>{d.hoy.rondas === 1 ? "ronda" : "rondas"} · {duracion(d.hoy.minutos)}</small>
            </div>
            <div className="dato">
              <span>Últimos 7 días</span>
              <strong>{d.semana.rondas}</strong>
              <small>{d.semana.rondas === 1 ? "ronda" : "rondas"} · {duracion(d.semana.minutos)}</small>
            </div>
            <div className="dato">
              <span>Con algo que anotar</span>
              <strong>{d.semana.con_hallazgos}</strong>
              <small>en los últimos 7 días</small>
            </div>
          </section>

          <section className="tarjeta">
            <div className="titulo-rondas">
              <h2>Rondas anteriores</h2>
              {d.recientes.length > 0 && (
                <button className="descargar" onClick={() => csvRondas(d.recientes, "aulaviva-monitoreo-ml.csv")}>
                  <Icono nombre="descargar" />
                  Descargar Excel
                </button>
              )}
            </div>
            {d.recientes.length === 0 ? (
              <p className="vacio">Todavía no hay rondas terminadas.</p>
            ) : (
              <ul className="lista-rondas">
                {d.recientes.map((r) => (
                  <li key={r.id}>
                    <div className="ronda-linea">
                      <strong>{nombreRonda(r)}</strong>
                      <span>
                        {dia(r.inicio)}, {hora(r.inicio)}–{r.fin ? hora(r.fin) : ""} · {duracion(minutosEntre(r.inicio, r.fin))}
                      </span>
                    </div>
                    <div className="chips">
                      {r.hallazgos.length ? (
                        r.hallazgos.map((h) => (
                          <span key={h} className="insignia hallazgo">
                            {HALLAZGOS[h]}
                          </span>
                        ))
                      ) : (
                        <span className="insignia en-orden">Todo en orden</span>
                      )}
                    </div>
                    {r.nota && <p>{r.nota}</p>}
                    {r.fotos > 0 && <FotosReporte reporteId={r.id} total={r.fotos} ruta={`/api/monitoreo/${r.id}/fotos`} />}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
