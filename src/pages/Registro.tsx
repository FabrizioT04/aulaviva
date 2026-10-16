import { useEffect, useRef, useState } from "react";
import { TIPOS_FALLA, TIPOS_PRINCIPALES } from "../../shared/tipos";
import { sugerirTipo } from "../../shared/sugerencia";
import type { AulaConEstado, DetalleAula, EntradaTi, EstadoReporte, Reporte, TipoFalla } from "../../shared/tipos";
import type { Ruta } from "../App";
import { api, NoAutorizado } from "../api";
import { canal, descripcionAula, duracion, ETIQUETA_FALLA, fechaCorta, minutosDesde } from "../formato";
import Icono from "../Icono";

const ORIGENES: { valor: EntradaTi; etiqueta: string }[] = [
  { valor: "whatsapp", etiqueta: "WhatsApp" },
  { valor: "presencial", etiqueta: "En persona" },
  { valor: "otro", etiqueta: "Otro" },
];

// Estado con el que TI deja registrado el caso
const ESTADOS: { valor: EstadoReporte; etiqueta: string; clase?: string; boton: string; listo: string }[] = [
  { valor: "abierto", etiqueta: "Pendiente", boton: "Registrar incidencia", listo: "Registrado" },
  { valor: "en_atencion", etiqueta: "En atención", boton: "Registrar en atención", listo: "Registrado en atención" },
  { valor: "resuelto", etiqueta: "Resuelto", clase: "exito", boton: "Registrar como resuelto", listo: "Registrado como resuelto" },
  { valor: "escalado", etiqueta: "Escalado", clase: "escalado", boton: "Registrar como escalado", listo: "Registrado como escalado" },
];

// Fecha y hora local en el formato que usa <input type="datetime-local">
function ahoraLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const aIso = (local: string) => new Date(local).toISOString();

// Registro rápido: lo que TI llena al leer el mensaje de WhatsApp o cuando le cuentan en persona
export default function Registro({ onNoAutorizado, ir }: { onNoAutorizado: () => void; ir: (r: Ruta) => void }) {
  const [aulas, setAulas] = useState<AulaConEstado[]>([]);
  const [aulaTexto, setAulaTexto] = useState("");
  const [origen, setOrigen] = useState<EntradaTi>("whatsapp");
  const [tipo, setTipo] = useState<TipoFalla | null>(null);
  const [masTipos, setMasTipos] = useState(false);
  const [bloquea, setBloquea] = useState(false);
  const [docente, setDocente] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [llegoEn, setLlegoEn] = useState(ahoraLocal);
  const [estado, setEstado] = useState<EstadoReporte>("abierto");
  const [ticket, setTicket] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [atendidoEn, setAtendidoEn] = useState(ahoraLocal);
  const [resueltoEn, setResueltoEn] = useState(ahoraLocal);
  const [causa, setCausa] = useState("");
  const [notas, setNotas] = useState("");
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [historial, setHistorial] = useState<Reporte[]>([]);
  const campoNotas = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api<AulaConEstado[]>("/api/aulas")
      .then(setAulas)
      .catch((e) => (e instanceof NoAutorizado ? onNoAutorizado() : null));
  }, [onNoAutorizado]);

  // Se puede escribir el número ("204"), el nombre ("Aula 204") o la sección que dice el docente ("3B")
  const buscado = aulaTexto.trim().toUpperCase();
  const aula = aulas.find(
    (a) => a.nombre.toUpperCase() === buscado || a.codigo === buscado || a.seccion?.toUpperCase() === buscado,
  );

  // Historial del aula elegida, para avisar si ya está reportada y mostrar cómo se resolvió antes
  const aulaId = aula?.id;
  useEffect(() => {
    setHistorial([]);
    if (aulaId == null) return;
    let vivo = true;
    api<DetalleAula>(`/api/aulas/${aulaId}`)
      .then((d) => vivo && setHistorial(d.reportes))
      .catch(() => null);
    return () => {
      vivo = false;
    };
  }, [aulaId]);

  // Si el detalle habla de otra falla que la elegida, se sugiere cambiarla
  const sugerido = sugerirTipo(descripcion, tipo);
  const delTipo = tipo ? historial.filter((r) => r.tipo_falla === tipo) : [];
  const abiertos = delTipo.filter((r) => r.estado !== "resuelto");
  const anteriores = delTipo.filter((r) => r.estado === "resuelto" && (r.causa || r.notas_resolucion)).slice(0, 3);

  function usarSolucion(r: Reporte) {
    setEstado("resuelto");
    setCausa(r.causa ?? "");
    setNotas(r.notas_resolucion ?? "");
    requestAnimationFrame(() => campoNotas.current?.focus());
  }

  const opcion = ESTADOS.find((o) => o.valor === estado)!;
  // Llegué al aula: en atención y resuelto siempre; en escalado también, porque TI ya revisó antes de derivarlo
  const conLlegada = estado !== "abierto";
  const faltaAlgo =
    !aula ||
    !tipo ||
    !llegoEn ||
    (conLlegada && !atendidoEn) ||
    (estado === "resuelto" && (!resueltoEn || !notas.trim()));

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!aula || !tipo) return;
    setEnviando(true);
    setMensaje(null);
    try {
      await api("/api/reportes", {
        method: "POST",
        body: JSON.stringify({
          aula_id: aula.id,
          tipo_falla: tipo,
          entrada: origen,
          bloquea_clase: bloquea,
          reportado_por_nombre: docente,
          descripcion,
          reportado_en: aIso(llegoEn),
          estado,
          ...(conLlegada && { atendido_en: aIso(atendidoEn) }),
          ...(estado === "resuelto" && { resuelto_en: aIso(resueltoEn), notas_resolucion: notas }),
          ...((estado === "resuelto" || estado === "escalado") && { causa }),
          ...(estado === "escalado" && { ticket_glpi: ticket }),
          ...(estado !== "resuelto" && { observaciones }),
        }),
      });
      setMensaje({ ok: true, texto: `${opcion.listo}: ${aula.nombre}` });
      setAulaTexto("");
      setOrigen("whatsapp");
      setTipo(null);
      setBloquea(false);
      setDocente("");
      setDescripcion("");
      setLlegoEn(ahoraLocal());
      setEstado("abierto");
      setTicket("");
      setObservaciones("");
      setAtendidoEn(ahoraLocal());
      setResueltoEn(ahoraLocal());
      setCausa("");
      setNotas("");
    } catch (err) {
      if (err instanceof NoAutorizado) return onNoAutorizado();
      setMensaje({ ok: false, texto: err instanceof Error && !(err instanceof TypeError) ? err.message : "No se pudo registrar. Intenta de nuevo." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="registro">
      <header className="cabecera-pagina">
        <div>
          <h1>Registrar incidencia</h1>
          <p className="subtitulo">Para lo que llega por WhatsApp, te cuentan en persona o por otro canal.</p>
        </div>
      </header>
      <form className="tarjeta" onSubmit={enviar}>
        <h2 className="seccion-form">1. Información de la incidencia</h2>
        <div className="fila-doble">
        <label>
          Aula
          <input
            list="lista-aulas"
            value={aulaTexto}
            onChange={(e) => setAulaTexto(e.target.value)}
            placeholder="Escribe 204 o la sección, como 3B"
            inputMode="search"
          />
          <datalist id="lista-aulas">
            {aulas.map((a) => (
              <option key={a.id} value={a.nombre} label={descripcionAula(a)} />
            ))}
          </datalist>
          {aula && (
            <span className="aula-elegida">
              {aula.nombre} · {descripcionAula(aula)}
            </span>
          )}
        </label>

        <fieldset>
          <legend>Origen del reporte</legend>
          <div className="segmentado">
            {ORIGENES.map((o) => (
              <button
                type="button"
                key={o.valor}
                className={origen === o.valor ? "activo" : ""}
                aria-pressed={origen === o.valor}
                onClick={() => setOrigen(o.valor)}
              >
                {o.etiqueta}
              </button>
            ))}
          </div>
        </fieldset>
        </div>

        <fieldset>
          <legend>Tipo de falla</legend>
          <div className="opciones-falla">
            {(masTipos ? TIPOS_FALLA : TIPOS_PRINCIPALES).map((t) => (
              <button
                type="button"
                key={t}
                className={tipo === t ? "opcion activo" : "opcion"}
                aria-pressed={tipo === t}
                onClick={() => setTipo(t)}
              >
                <Icono nombre={t} />
                {ETIQUETA_FALLA[t]}
              </button>
            ))}
          </div>
          {!masTipos && (
            <button type="button" className="enlace ver-mas-tipos" onClick={() => setMasTipos(true)}>
              Ver más: {TIPOS_FALLA.filter((t) => !TIPOS_PRINCIPALES.includes(t)).map((t) => ETIQUETA_FALLA[t]).join(", ")}
              <Icono nombre="abajo" />
            </button>
          )}
        </fieldset>

        {aula && tipo && (abiertos.length > 0 || anteriores.length > 0) && (
          <section className="historial-relacionado" aria-label="Historial de esta falla en el aula">
            {abiertos.length > 0 && (
              <div className="ya-abierto">
                <Icono nombre="info" />
                <p>
                  {abiertos.length === 1
                    ? `Ya hay un reporte abierto de ${ETIQUETA_FALLA[tipo]} en esta aula: llegó`
                    : `Ya hay ${abiertos.length} reportes abiertos de ${ETIQUETA_FALLA[tipo]} en esta aula; el último llegó`}{" "}
                  {canal(abiertos[0])} hace {duracion(minutosDesde(abiertos[0].reportado_en))}
                  {abiertos[0].descripcion ? ` (“${abiertos[0].descripcion}”)` : ""}. Si es la misma falla, atiéndelo desde el
                  dashboard en vez de registrarlo otra vez.
                </p>
                <button type="button" className="enlace" onClick={() => ir({ pantalla: "dashboard" })}>
                  Ir al dashboard
                </button>
              </div>
            )}
            {anteriores.length > 0 && (
              <>
                <h2>Cómo se resolvió antes</h2>
                <ul>
                  {anteriores.map((r) => (
                    <li key={r.id}>
                      <div className="caso-cabecera">
                        <strong>{r.descripcion || ETIQUETA_FALLA[r.tipo_falla]}</strong>
                        <small>{fechaCorta(r.resuelto_en ?? r.reportado_en)}</small>
                      </div>
                      {r.causa && (
                        <p>
                          <span>Causa:</span> {r.causa}
                        </p>
                      )}
                      {r.notas_resolucion && (
                        <p>
                          <span>Se hizo:</span> {r.notas_resolucion}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => usarSolucion(r)}
                        title="Marca este reporte como resuelto y copia la causa y lo que se hizo. Puedes editarlo antes de registrar."
                      >
                        Usar esta solución
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        <fieldset>
          <legend>¿Bloquea la clase ahora mismo?</legend>
          <div className="segmentado">
            <button type="button" className={bloquea ? "activo peligro" : ""} onClick={() => setBloquea(true)}>
              Sí, bloquea
            </button>
            <button type="button" className={!bloquea ? "activo" : ""} onClick={() => setBloquea(false)}>
              No
            </button>
          </div>
        </fieldset>

        <div className="fila-doble">
          <label>
            Docente que reporta (opcional)
            <input value={docente} onChange={(e) => setDocente(e.target.value)} placeholder="Nombre del docente" />
          </label>

          <label>
            Fecha y hora del reporte
            <input type="datetime-local" value={llegoEn} max={ahoraLocal()} onChange={(e) => setLlegoEn(e.target.value)} />
          </label>
        </div>

        <label>
          Detalle (opcional)
          <textarea
            rows={2}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej. el proyector enciende pero no muestra imagen"
          />
        </label>
        {sugerido && (
          <p className="sugerencia" role="status">
            Lo que escribiste parece una falla de <strong>{ETIQUETA_FALLA[sugerido]}</strong>.{" "}
            <button
              type="button"
              className="enlace"
              onClick={() => {
                if (!TIPOS_PRINCIPALES.includes(sugerido)) setMasTipos(true);
                setTipo(sugerido);
              }}
            >
              Cambiar a {ETIQUETA_FALLA[sugerido]}
            </button>
          </p>
        )}

        <h2 className="seccion-form">2. Atención técnica</h2>
        <fieldset>
          <legend>Estado de la incidencia</legend>
          <div className="segmentado cuatro">
            {ESTADOS.map((o) => (
              <button
                type="button"
                key={o.valor}
                className={estado === o.valor ? `activo ${o.clase ?? ""}` : ""}
                aria-pressed={estado === o.valor}
                onClick={() => setEstado(o.valor)}
              >
                {o.etiqueta}
              </button>
            ))}
          </div>
        </fieldset>

        {conLlegada && (
          <div className="horas">
            <label>
              Llegué al aula
              <input type="datetime-local" value={atendidoEn} onChange={(e) => setAtendidoEn(e.target.value)} />
            </label>
            {estado === "resuelto" && (
              <label>
                Quedó resuelto
                <input type="datetime-local" value={resueltoEn} onChange={(e) => setResueltoEn(e.target.value)} />
              </label>
            )}
            {estado === "escalado" && (
              <label>
                N.° de ticket GLPI
                <input
                  value={ticket}
                  onChange={(e) => setTicket(e.target.value)}
                  placeholder="Ej. 4521"
                  inputMode="numeric"
                  maxLength={40}
                />
              </label>
            )}
          </div>
        )}

        {(estado === "resuelto" || estado === "escalado") && (
          <label>
            {estado === "escalado" ? "Diagnóstico: ¿qué encontraste?" : "¿Qué encontraste? (causa, si la sabes)"}
            <textarea
              rows={2}
              value={causa}
              onChange={(e) => setCausa(e.target.value)}
              placeholder={
                estado === "escalado"
                  ? "Ej. el proyector no enciende ni con otro cable de poder; parece la fuente"
                  : "Ej. el cable HDMI estaba suelto detrás del proyector"
              }
            />
          </label>
        )}

        {estado === "resuelto" && (
          <label>
            ¿Qué hiciste para resolverlo?
            <textarea
              ref={campoNotas}
              rows={3}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej. reinicié el switch del piso 3 y volvió el internet"
            />
          </label>
        )}

        {estado !== "resuelto" && (
          <label>
            Observaciones técnicas (opcional)
            <textarea
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder={
                estado === "escalado"
                  ? "Ej. GLPI enviará un técnico; el docente usa el proyector del 205 mientras tanto"
                  : "Verificaciones, avances o lo que queda pendiente"
              }
            />
          </label>
        )}

        <p className="datos-automaticos">
          <Icono nombre="reloj" />
          <span>
            Se guardan solos quién registra, la fecha de registro y cada cambio de estado. Los ves en el historial del aula.
          </span>
        </p>

        <button className="primario" type="submit" disabled={faltaAlgo || enviando}>
          {enviando ? "Registrando…" : opcion.boton}
        </button>
        {mensaje && <p className={mensaje.ok ? "aviso ok" : "aviso error"}>{mensaje.texto}</p>}
      </form>
    </div>
  );
}
