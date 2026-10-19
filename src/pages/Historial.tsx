import { useCallback, useEffect, useMemo, useState } from "react";
import type { Ruta } from "../App";
import { ETIQUETA_ESTADO_DANO, TIPOS_DANO, type Dano, type GrupoDano } from "../../shared/danos";
import { HALLAZGOS, type Monitoreo } from "../../shared/monitoreo";
import type { Historial as DatosHistorial, Reporte } from "../../shared/tipos";
import { api, NoAutorizado } from "../api";
import FotosReporte from "../FotosReporte";
import Icono from "../Icono";
import { useEnVivo } from "../useEnVivo";
import { csvRondas, descargarCsv, fechaExcel } from "../csv";
import { canal, duracion, ETIQUETA_ESTADO, ETIQUETA_FALLA, minutosEntre } from "../formato";

interface Props {
  onNoAutorizado: () => void;
  ir: (r: Ruta) => void;
}

type Clase = "fallas" | "danos" | "monitoreo";

const TODO = "todo";
const GRUPO: Record<GrupoDano, string> = { tecnologia: "Equipo tecnológico", local: "Mobiliario o infraestructura" };

// "2026-10" → "Octubre 2026"
function nombreMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  const nombre = new Date(Date.UTC(a, m - 1, 15)).toLocaleString("es-PE", { month: "long", year: "numeric", timeZone: "UTC" });
  return nombre.charAt(0).toUpperCase() + nombre.slice(1).replace(" de ", " ");
}

// Fecha y hora en Lima, como se lee en el colegio
function fechaHora(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

const horaLima = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "";

const sinTildes = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const minutos = (desde: string, hasta: string | null) => {
  const m = minutosEntre(desde, hasta);
  return m == null ? null : Math.round(m);
};

const aulaDe = (r: Reporte) => `${r.aula_nombre}${r.aula_seccion ? ` · ${r.aula_seccion}` : ""}`;

function csvFallas(filas: Reporte[], mes: string) {
  descargarCsv(
    `aulaviva-fallas-${mes}.csv`,
    ["Reportado", "Aula", "Falla", "Bloqueó la clase", "Reportó", "Canal", "Estado", "Atendido", "Resuelto", "Minutos hasta atención", "Minutos hasta resolución", "Descripción", "Causa", "Qué se hizo", "Observaciones", "Ticket GLPI"],
    filas.map((r) => [
      fechaExcel(r.reportado_en),
      aulaDe(r),
      ETIQUETA_FALLA[r.tipo_falla] ?? r.tipo_falla,
      r.bloquea_clase ? "Sí" : "No",
      r.reportado_por_nombre,
      canal(r),
      ETIQUETA_ESTADO[r.estado] ?? r.estado,
      fechaExcel(r.atendido_en),
      fechaExcel(r.resuelto_en),
      minutos(r.reportado_en, r.atendido_en),
      minutos(r.reportado_en, r.resuelto_en),
      r.descripcion,
      r.causa,
      r.notas_resolucion,
      r.observaciones,
      r.ticket_glpi,
    ]),
  );
}

function csvDanos(filas: Dano[], mes: string) {
  descargarCsv(
    `aulaviva-danos-${mes}.csv`,
    ["Reportado", "Aula", "Grupo", "Daño", "Equipo", "Sección", "Estudiante", "Reportó", "Estado", "Resuelto", "Descripción", "Qué se hizo"],
    filas.map((d) => [
      fechaExcel(d.reportado_en),
      d.aula_nombre,
      GRUPO[d.grupo],
      TIPOS_DANO[d.tipo]?.etiqueta ?? d.tipo,
      d.equipo,
      d.seccion,
      d.estudiante,
      d.reportado_por,
      ETIQUETA_ESTADO_DANO[d.estado],
      fechaExcel(d.resuelto_en),
      d.descripcion,
      d.nota_cierre,
    ]),
  );
}

// Todo lo que llegó, mes por mes: el resumen del Observatorio de ese mes y la lista completa de fallas
// y daños, para buscar un caso antiguo o descargarlo en Excel para un informe
export default function Historial({ onNoAutorizado, ir }: Props) {
  const [mes, setMes] = useState<string | null>(null); // null = el mes actual
  const [clase, setClase] = useState<Clase>("fallas");
  const [busqueda, setBusqueda] = useState("");
  const [d, setD] = useState<DatosHistorial | null>(null);

  const cargar = useCallback(() => {
    api<DatosHistorial>(`/api/historial${mes ? `?mes=${mes}` : ""}`)
      .then(setD)
      .catch((e) => (e instanceof NoAutorizado ? onNoAutorizado() : null));
  }, [mes, onNoAutorizado]);

  useEffect(cargar, [cargar]);
  useEnVivo(() => cargar());

  const texto = sinTildes(busqueda.trim());
  const fallas = useMemo(
    () =>
      (d?.reportes ?? []).filter(
        (r) =>
          !texto ||
          sinTildes(
            [aulaDe(r), ETIQUETA_FALLA[r.tipo_falla], r.reportado_por_nombre, r.descripcion, r.causa, r.notas_resolucion, r.ticket_glpi].join(" "),
          ).includes(texto),
      ),
    [d, texto],
  );
  const danos = useMemo(
    () =>
      (d?.danos ?? []).filter(
        (x) =>
          !texto ||
          sinTildes([x.aula_nombre, TIPOS_DANO[x.tipo]?.etiqueta, x.equipo, x.estudiante, x.reportado_por, x.descripcion, x.nota_cierre].join(" ")).includes(
            texto,
          ),
      ),
    [d, texto],
  );

  const rondas = useMemo(
    () =>
      (d?.monitoreo?.rondas ?? []).filter(
        (r: Monitoreo) =>
          !texto ||
          sinTildes([r.aula_nombre, r.aula_seccion, r.email, r.nota, ...r.hallazgos.map((h) => HALLAZGOS[h])].join(" ")).includes(texto),
      ),
    [d, texto],
  );
  // Si el mes elegido viene sin monitoreo (no debería), vuelve a Fallas
  const vista: Clase = clase === "monitoreo" && !d?.monitoreo ? "fallas" : clase;

  const elegido = d ? (d.mes ?? TODO) : (mes ?? "");
  const archivo = d?.mes ?? "todo";

  return (
    <div className="observatorio pagina-historial">
      <header className="cabecera-pagina">
        <div>
          <h1>Historial</h1>
          <p className="subtitulo">
            Todas las fallas y daños que llegaron{d?.monitoreo ? ", y las rondas en los laboratorios ML" : ""}, mes por mes.
          </p>
        </div>
        <label className="selector-mes">
          <span className="solo-lector">Mes</span>
          <select value={elegido} onChange={(e) => setMes(e.target.value)}>
            {d?.meses.map((m) => (
              <option key={m.mes} value={m.mes}>
                {nombreMes(m.mes)} · {m.fallas} {m.fallas === 1 ? "falla" : "fallas"}, {m.danos} {m.danos === 1 ? "daño" : "daños"}
                {m.rondas != null && `, ${m.rondas} ${m.rondas === 1 ? "ronda" : "rondas"}`}
              </option>
            ))}
            <option value={TODO}>Todo el historial</option>
          </select>
        </label>
      </header>

      {!d ? (
        <p className="vacio">Cargando…</p>
      ) : (
        <>
          <section className="resumen">
            <div className="dato">
              <span>Incidencias</span>
              <strong>{d.resumen.total}</strong>
              <small>{d.resumen.abiertos ?? 0} sin resolver</small>
            </div>
            <div className="dato">
              <span>Bloquearon la clase</span>
              <strong>{d.resumen.bloqueantes ?? 0}</strong>
              <small>{d.resumen.escalados ?? 0} escaladas a GLPI</small>
            </div>
            <div className="dato">
              <span>Atención promedio</span>
              <strong>{duracion(d.resumen.prom_atencion_min)}</strong>
            </div>
            <div className="dato">
              <span>Resolución promedio</span>
              <strong>{duracion(d.resumen.prom_resolucion_min)}</strong>
            </div>
            <div className="dato">
              <span>Daños</span>
              <strong>{d.danos.length}</strong>
              <small>{d.danos.filter((x) => x.estado !== "resuelto").length} sin resolver</small>
            </div>
            {d.monitoreo && (
              <div className="dato">
                <span>Monitoreo ML</span>
                <strong>{duracion(d.monitoreo.minutos)}</strong>
                <small>
                  {d.monitoreo.rondas.length} {d.monitoreo.rondas.length === 1 ? "ronda" : "rondas"} en los laboratorios
                </small>
              </div>
            )}
          </section>

          <section className="tarjeta">
            <div className="historial-controles">
              <div className="segmentado compacto" role="group" aria-label="Qué ver">
                <button className={vista === "fallas" ? "activo" : ""} onClick={() => setClase("fallas")}>
                  Fallas ({d.reportes.length})
                </button>
                <button className={vista === "danos" ? "activo" : ""} onClick={() => setClase("danos")}>
                  Daños ({d.danos.length})
                </button>
                {d.monitoreo && (
                  <button className={vista === "monitoreo" ? "activo" : ""} onClick={() => setClase("monitoreo")}>
                    Monitoreo ({d.monitoreo.rondas.length})
                  </button>
                )}
              </div>
              <label className="buscador">
                <Icono nombre="buscar" />
                <input
                  type="search"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar aula, docente, causa…"
                  aria-label="Buscar en el historial"
                />
              </label>
              <button
                className="descargar"
                disabled={!(vista === "fallas" ? fallas : vista === "danos" ? danos : rondas).length}
                onClick={() =>
                  vista === "fallas"
                    ? csvFallas(fallas, archivo)
                    : vista === "danos"
                      ? csvDanos(danos, archivo)
                      : csvRondas(rondas, `aulaviva-monitoreo-${archivo}.csv`)
                }
              >
                <Icono nombre="descargar" />
                Descargar Excel
              </button>
            </div>

            {vista === "fallas" ? (
              fallas.length === 0 ? (
                <p className="vacio">{texto ? "Nada coincide con la búsqueda." : "No llegaron fallas en este periodo."}</p>
              ) : (
                <div className="tabla-contenedor">
                  <table className="tabla-historial">
                    <thead>
                      <tr>
                        <th>Reportado</th>
                        <th>Aula</th>
                        <th>Falla</th>
                        <th>Reportó</th>
                        <th>Estado</th>
                        <th>Atención</th>
                        <th>Resolución</th>
                        <th>Causa y solución</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fallas.map((r) => (
                        <tr key={r.id} onClick={() => ir({ pantalla: "aula", id: r.aula_id })} title="Ver el aula">
                          <td className="fecha">{fechaHora(r.reportado_en)}</td>
                          <td className="col-aula">{aulaDe(r)}</td>
                          <td className="col-falla">
                            {ETIQUETA_FALLA[r.tipo_falla]}
                            {r.descripcion && <small>{r.descripcion}</small>}
                            {r.bloquea_clase ? <span className="marca-bloqueo">Bloqueó la clase</span> : null}
                          </td>
                          <td>
                            {r.reportado_por_nombre?.split("@")[0] ?? "—"}
                            <small>{canal(r)}</small>
                          </td>
                          <td>
                            <span className={`insignia estado-historial ${r.estado}`}>{ETIQUETA_ESTADO[r.estado]}</span>
                            {r.ticket_glpi && <small>GLPI #{r.ticket_glpi}</small>}
                          </td>
                          <td className="numero">{duracion(minutosEntre(r.reportado_en, r.atendido_en))}</td>
                          <td className="numero">{duracion(minutosEntre(r.reportado_en, r.resuelto_en))}</td>
                          <td>
                            {r.causa ?? ""}
                            {r.notas_resolucion && <small>{r.notas_resolucion}</small>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : vista === "monitoreo" ? (
              rondas.length === 0 ? (
                <p className="vacio">{texto ? "Nada coincide con la búsqueda." : "No hubo rondas de monitoreo en este periodo."}</p>
              ) : (
                <div className="tabla-contenedor">
                  <table className="tabla-historial tabla-rondas">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Aula</th>
                        <th>Horario</th>
                        <th>Duración</th>
                        <th>Quién</th>
                        <th>Qué se encontró</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rondas.map((r) => (
                        <tr key={r.id}>
                          <td className="fecha">{fechaHora(r.inicio).split(",")[0]}</td>
                          <td className="col-aula">{r.aula_nombre}{r.aula_seccion ? ` · ${r.aula_seccion}` : ""}</td>
                          <td className="numero">
                            {horaLima(r.inicio)}–{horaLima(r.fin)}
                          </td>
                          <td className="numero">{duracion(minutosEntre(r.inicio, r.fin))}</td>
                          <td>{r.email.split("@")[0]}</td>
                          <td>
                            {r.hallazgos.length ? r.hallazgos.map((h) => HALLAZGOS[h]).join(", ") : "Todo en orden"}
                            {r.nota && <small>{r.nota}</small>}
                            {r.fotos > 0 && <FotosReporte reporteId={r.id} total={r.fotos} ruta={`/api/monitoreo/${r.id}/fotos`} />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : danos.length === 0 ? (
              <p className="vacio">{texto ? "Nada coincide con la búsqueda." : "No llegaron daños en este periodo."}</p>
            ) : (
              <div className="tabla-contenedor">
                <table className="tabla-historial">
                  <thead>
                    <tr>
                      <th>Reportado</th>
                      <th>Aula</th>
                      <th>Daño</th>
                      <th>Equipo y estudiante</th>
                      <th>Reportó</th>
                      <th>Estado</th>
                      <th>Qué se hizo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {danos.map((x) => (
                      <tr key={x.id} onClick={() => ir({ pantalla: "danos" })} title="Ir a Daños y mantenimiento">
                        <td className="fecha">{fechaHora(x.reportado_en)}</td>
                        <td className="col-aula">{x.aula_nombre}</td>
                        <td>
                          {TIPOS_DANO[x.tipo]?.etiqueta ?? x.tipo}
                          {x.descripcion && <small>{x.descripcion}</small>}
                        </td>
                        <td>
                          {x.equipo ?? "—"}
                          {(x.estudiante || x.seccion) && <small>{[x.estudiante, x.seccion].filter(Boolean).join(" · ")}</small>}
                        </td>
                        <td>{x.reportado_por.split("@")[0]}</td>
                        <td>
                          <span className={`insignia estado-dano ${x.estado}`}>{ETIQUETA_ESTADO_DANO[x.estado]}</span>
                          {x.resuelto_en && <small>{fechaHora(x.resuelto_en)}</small>}
                        </td>
                        <td>{x.nota_cierre ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
