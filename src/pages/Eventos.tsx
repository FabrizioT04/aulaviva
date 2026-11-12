import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  EQUIPOS_EVENTO,
  ETIQUETA_ESTADO_EVENTO,
  ETIQUETA_TIPO_EVENTO,
  LISTA_EQUIPOS_EVENTO,
  TIPOS_EVENTO,
  type EquipoEvento,
  type EstadoEvento,
  type Evento,
  type TipoEvento,
} from "../../shared/eventos";
import type { AulaConEstado, Sesion } from "../../shared/tipos";
import { api, NoAutorizado } from "../api";
import ConfirmarEliminacion from "../ConfirmarEliminacion";
import Icono from "../Icono";
import { useEnVivo } from "../useEnVivo";

interface Props {
  sesion: Sesion;
  onNoAutorizado: () => void;
}

// Fecha y hora en la zona del navegador, como las piden <input type="date"> y <input type="time">
const dos = (n: number) => String(n).padStart(2, "0");
const diaLocal = (d: Date) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const horaLocal = (d: Date) => `${dos(d.getHours())}:${dos(d.getMinutes())}`;

const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });
const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-PE", { hour: "numeric", minute: "2-digit" });
const horario = (e: Pick<Evento, "inicio" | "fin">) => `${hora(e.inicio)}${e.fin ? ` a ${hora(e.fin)}` : ""}`;

// Eventos externos (instituciones que usan un aula o un patio) y actividades de apoyo de TI que no son
// una falla ni un daño, como subir hojas bond. Los registra TI; COA los ve.
export default function Eventos({ sesion, onNoAutorizado }: Props) {
  const esTi = sesion.rol === "ti";
  const [tipo, setTipo] = useState<TipoEvento | null>(null);
  const [pasados, setPasados] = useState(false);
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [formulario, setFormulario] = useState<{ tipo: TipoEvento; evento?: Evento } | null>(null);
  const [porEliminar, setPorEliminar] = useState<Evento | null>(null);
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(() => {
    const filtro = new URLSearchParams({ estado: pasados ? "pasados" : "programados", ...(tipo ? { tipo } : {}) });
    api<Evento[]>(`/api/eventos?${filtro}`)
      .then(setEventos)
      .catch((e) => (e instanceof NoAutorizado ? onNoAutorizado() : setEventos([])));
  }, [pasados, tipo, onNoAutorizado]);

  useEffect(cargar, [cargar]);
  useEnVivo((evento) => {
    if (!evento || evento.tipo === "eventos") cargar();
  });

  async function cambiar(e: Evento, estado: EstadoEvento, nota?: string) {
    try {
      await api(`/api/eventos/${e.id}`, { method: "PATCH", body: JSON.stringify({ estado, nota_cierre: nota }) });
      setAviso(`"${e.nombre}" quedó como ${ETIQUETA_ESTADO_EVENTO[estado].toLowerCase()}.`);
      cargar();
    } catch (err) {
      if (err instanceof NoAutorizado) onNoAutorizado();
      else setAviso((err as Error).message);
    }
  }

  // Agrupados por día, en el orden que llegan
  const dias: { dia: string; lista: Evento[] }[] = [];
  for (const e of eventos ?? []) {
    const dia = diaLocal(new Date(e.inicio));
    const grupo = dias.at(-1);
    if (grupo?.dia === dia) grupo.lista.push(e);
    else dias.push({ dia, lista: [e] });
  }

  return (
    <div className="eventos">
      <div className="cabecera-pagina">
        <div>
          <h1>Eventos y actividades</h1>
          <p className="subtitulo">
            Eventos externos que usan un aula o un patio y lo que TI debe dejar listo, y actividades de apoyo que no son una falla, como
            subir hojas bond.
          </p>
        </div>
        {esTi && !formulario && (
          <div className="acciones-cabecera">
            <button onClick={() => setFormulario({ tipo: "apoyo" })}>Registrar actividad</button>
            <button className="primario" onClick={() => setFormulario({ tipo: "externo" })}>
              Registrar evento
            </button>
          </div>
        )}
      </div>

      {formulario && (
        <FormEvento
          key={formulario.evento?.id ?? formulario.tipo}
          inicial={formulario.evento}
          tipoInicial={formulario.tipo}
          onNoAutorizado={onNoAutorizado}
          onCancelar={() => setFormulario(null)}
          onGuardado={(mensaje) => {
            setFormulario(null);
            setAviso(mensaje);
            cargar();
          }}
        />
      )}
      {aviso && (
        <p className="aviso ok" role="status">
          {aviso}
        </p>
      )}

      <div className="filtros-danos">
        <div className="chips" role="group" aria-label="Tipo">
          {[null, ...TIPOS_EVENTO].map((t) => (
            <button key={t ?? "todos"} className={tipo === t ? "chip activo" : "chip"} aria-pressed={tipo === t} onClick={() => setTipo(t)}>
              {t ? ETIQUETA_TIPO_EVENTO[t] : "Todos"}
            </button>
          ))}
        </div>
        <div className="segmentado compacto" role="group" aria-label="Estado">
          <button className={!pasados ? "activo" : ""} onClick={() => setPasados(false)}>
            Programados
          </button>
          <button className={pasados ? "activo" : ""} onClick={() => setPasados(true)}>
            Realizados y cancelados
          </button>
        </div>
      </div>

      {eventos === null && <p className="vacio">Cargando…</p>}
      {eventos?.length === 0 && <p className="vacio">{pasados ? "Todavía no hay nada registrado." : "No hay nada programado."}</p>}
      {dias.map(({ dia, lista }) => (
        <section key={dia} className="dia-eventos">
          <h2>{fechaLarga(lista[0].inicio)}</h2>
          <ul className="lista-danos">
            {lista.map((e) => (
              <FilaEvento
                key={e.id}
                evento={e}
                editable={esTi}
                onCambiar={cambiar}
                onEditar={() => setFormulario({ tipo: e.tipo, evento: e })}
                onEliminar={() => setPorEliminar(e)}
              />
            ))}
          </ul>
        </section>
      ))}

      {porEliminar && (
        <ConfirmarEliminacion
          detalle={`${ETIQUETA_TIPO_EVENTO[porEliminar.tipo]}: ${porEliminar.nombre}, ${fechaLarga(porEliminar.inicio)}`}
          onCancelar={() => setPorEliminar(null)}
          onConfirmar={async () => {
            await api(`/api/eventos/${porEliminar.id}`, { method: "DELETE" });
            setPorEliminar(null);
            setAviso("Registro eliminado.");
            cargar();
          }}
        />
      )}
    </div>
  );
}

function FilaEvento({
  evento: e,
  editable,
  onCambiar,
  onEditar,
  onEliminar,
}: {
  evento: Evento;
  editable: boolean;
  onCambiar: (e: Evento, estado: EstadoEvento, nota?: string) => void;
  onEditar: () => void;
  onEliminar: () => void;
}) {
  const [cerrando, setCerrando] = useState<EstadoEvento | null>(null);
  const [nota, setNota] = useState("");
  const externo = e.tipo === "externo";
  const datos = [e.organiza && `Organiza: ${e.organiza}`, e.responsable && `Responsable: ${e.responsable}`, e.contacto && `Contacto: ${e.contacto}`].filter(
    Boolean,
  );
  return (
    <li className={`tarjeta dano evento ${e.estado}`}>
      <div className="dano-cabecera">
        <span className={`tipo-icono evento-${e.tipo}`}>
          <Icono nombre={externo ? "evento" : "check"} />
        </span>
        <div>
          <p className="dano-titulo">
            <strong>{e.nombre}</strong>
            <span>{horario(e)}</span>
            <span className={`insignia estado-evento ${e.estado}`}>{ETIQUETA_ESTADO_EVENTO[e.estado]}</span>
          </p>
          <small>
            {ETIQUETA_TIPO_EVENTO[e.tipo]}
            {e.aula_nombre ? ` · ${e.aula_nombre}` : ""} · registró {e.registrado_por}
          </small>
          {datos.length > 0 && <p className="dano-datos">{datos.join(" · ")}</p>}
          {e.equipos.length > 0 && (
            <ul className="equipos-evento" aria-label="Equipos que necesita">
              {e.equipos.map((q) => (
                <li key={q}>{EQUIPOS_EVENTO[q]}</li>
              ))}
            </ul>
          )}
          {e.notas && <p className="descripcion">“{e.notas}”</p>}
          {e.estado !== "programado" && e.nota_cierre && (
            <p className={e.estado === "cancelado" ? "dano-cierre cancelado" : "dano-cierre"}>{e.nota_cierre}</p>
          )}
        </div>
      </div>
      {editable &&
        (cerrando ? (
          <form
            className="cerrar-dano"
            onSubmit={(ev) => {
              ev.preventDefault();
              onCambiar(e, cerrando, nota);
            }}
          >
            <label>
              {cerrando === "cancelado" ? "¿Por qué se canceló? (opcional)" : "¿Cómo fue? (opcional)"}
              <textarea value={nota} onChange={(ev) => setNota(ev.target.value)} rows={2} autoFocus />
            </label>
            <div className="acciones">
              <button type="button" onClick={() => setCerrando(null)}>
                Volver
              </button>
              <button className="primario" type="submit">
                Marcar {ETIQUETA_ESTADO_EVENTO[cerrando].toLowerCase()}
              </button>
            </div>
          </form>
        ) : (
          <div className="acciones">
            <button className="enlace peligro" onClick={onEliminar}>
              Eliminar
            </button>
            <button onClick={onEditar}>Editar</button>
            {e.estado === "programado" ? (
              <>
                <button onClick={() => setCerrando("cancelado")}>{externo ? "Cancelar evento" : "Cancelar actividad"}</button>
                <button className="primario" onClick={() => setCerrando("realizado")}>
                  Marcar realizado
                </button>
              </>
            ) : (
              <button onClick={() => onCambiar(e, "programado")}>Volver a programado</button>
            )}
          </div>
        ))}
    </li>
  );
}

function FormEvento({
  inicial,
  tipoInicial,
  onGuardado,
  onCancelar,
  onNoAutorizado,
}: {
  inicial?: Evento;
  tipoInicial: TipoEvento;
  onGuardado: (mensaje: string) => void;
  onCancelar: () => void;
  onNoAutorizado: () => void;
}) {
  const ahora = new Date();
  const [aulas, setAulas] = useState<AulaConEstado[]>([]);
  const [tipo, setTipo] = useState<TipoEvento>(inicial?.tipo ?? tipoInicial);
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [aulaId, setAulaId] = useState<number | null>(inicial?.aula_id ?? null);
  const [dia, setDia] = useState(diaLocal(inicial ? new Date(inicial.inicio) : ahora));
  const [desde, setDesde] = useState(inicial ? horaLocal(new Date(inicial.inicio)) : "");
  const [hasta, setHasta] = useState(inicial?.fin ? horaLocal(new Date(inicial.fin)) : "");
  const [organiza, setOrganiza] = useState(inicial?.organiza ?? "");
  const [responsable, setResponsable] = useState(inicial?.responsable ?? "");
  const [contacto, setContacto] = useState(inicial?.contacto ?? "");
  const [equipos, setEquipos] = useState<EquipoEvento[]>(inicial?.equipos ?? []);
  const [notas, setNotas] = useState(inicial?.notas ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const externo = tipo === "externo";

  useEffect(() => {
    api<AulaConEstado[]>("/api/aulas")
      .then(setAulas)
      .catch((e) => (e instanceof NoAutorizado ? onNoAutorizado() : null));
  }, [onNoAutorizado]);

  // Los patios primero: es donde más se arma el equipo de sonido
  const ordenadas = [...aulas].sort((a, b) => Number(b.espacio === "patio") - Number(a.espacio === "patio"));

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    setError("");
    const inicio = new Date(`${dia}T${desde}`);
    const fin = hasta ? new Date(`${dia}T${hasta}`) : null;
    if (fin && fin <= inicio) return setError("La hora de fin debe ser después del inicio.");
    setGuardando(true);
    try {
      await api(inicial ? `/api/eventos/${inicial.id}` : "/api/eventos", {
        method: inicial ? "PUT" : "POST",
        body: JSON.stringify({
          tipo,
          nombre,
          aula_id: aulaId,
          inicio: inicio.toISOString(),
          fin: fin?.toISOString() ?? null,
          organiza,
          responsable,
          contacto,
          equipos,
          notas,
        }),
      });
      onGuardado(inicial ? "Cambios guardados." : `${ETIQUETA_TIPO_EVENTO[tipo]} registrado: ${nombre}.`);
    } catch (e) {
      if (e instanceof NoAutorizado) onNoAutorizado();
      else setError((e as Error).message);
      setGuardando(false);
    }
  }

  return (
    <form className="tarjeta form-dano" onSubmit={enviar}>
      <div className="opciones-falla dos" role="group" aria-label="Qué vas a registrar">
        {TIPOS_EVENTO.map((t) => (
          <button type="button" key={t} className={tipo === t ? "opcion activo" : "opcion"} aria-pressed={tipo === t} onClick={() => setTipo(t)}>
            <Icono nombre={t === "externo" ? "evento" : "check"} />
            {ETIQUETA_TIPO_EVENTO[t]}
            <small>{t === "externo" ? "Una institución usa un aula o un patio" : "Una tarea que no es falla ni daño"}</small>
          </button>
        ))}
      </div>
      <label>
        {externo ? "Nombre del evento" : "¿Qué hiciste?"}
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder={externo ? "Ej. Charla de la municipalidad" : "Ej. Subir hojas bond"}
          maxLength={120}
          required
          autoFocus
        />
      </label>
      <div className="fila-campos">
        <label>
          Fecha
          <input type="date" value={dia} onChange={(e) => setDia(e.target.value)} required />
        </label>
        <label>
          Desde
          <input type="time" value={desde} onChange={(e) => setDesde(e.target.value)} required />
        </label>
        <label>
          Hasta {externo && "(opcional)"}
          <input type="time" value={hasta} onChange={(e) => setHasta(e.target.value)} required={!externo} />
        </label>
      </div>
      <label>
        {externo ? "Lugar" : "Lugar (opcional)"}
        <select value={aulaId ?? ""} onChange={(e) => setAulaId(Number(e.target.value) || null)} required={externo}>
          <option value="">{externo ? "Elige…" : "Sin lugar"}</option>
          {ordenadas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
              {a.seccion ? ` · ${a.seccion}` : ""}
            </option>
          ))}
        </select>
      </label>
      {externo && (
        <>
          <div className="fila-campos">
            <label>
              Organiza
              <input value={organiza} onChange={(e) => setOrganiza(e.target.value)} placeholder="Institución o persona externa" maxLength={120} />
            </label>
            <label>
              Responsable del colegio
              <input value={responsable} onChange={(e) => setResponsable(e.target.value)} placeholder="Ej. Coordinación de Primaria" maxLength={120} />
            </label>
            <label>
              Contacto (opcional)
              <input value={contacto} onChange={(e) => setContacto(e.target.value)} placeholder="Teléfono o correo" maxLength={120} />
            </label>
          </div>
          <fieldset>
            <legend>¿Qué debe dejar listo TI?</legend>
            <div className="chips" role="group">
              {LISTA_EQUIPOS_EVENTO.map((q) => {
                const elegido = equipos.includes(q);
                return (
                  <button
                    type="button"
                    key={q}
                    className={elegido ? "chip activo" : "chip"}
                    aria-pressed={elegido}
                    onClick={() => setEquipos(elegido ? equipos.filter((x) => x !== q) : [...equipos, q])}
                  >
                    {EQUIPOS_EVENTO[q]}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </>
      )}
      <label>
        Notas (opcional)
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          placeholder={externo ? "Ej. Llegan 30 min antes para probar el sonido" : "Ej. 3 paquetes para la Sala de docentes"}
        />
      </label>
      <div className="acciones">
        <button type="button" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </button>
        <button className="primario" type="submit" disabled={guardando}>
          {guardando ? "Guardando…" : inicial ? "Guardar cambios" : externo ? "Registrar evento" : "Registrar actividad"}
        </button>
      </div>
      {error && <p className="aviso error">{error}</p>}
    </form>
  );
}
