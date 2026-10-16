import { useCallback, useEffect, useState } from "react";
import {
  ATIENDE_DANO,
  EQUIPO_DANOS,
  ETIQUETA_ATIENDE,
  ETIQUETA_ESTADO_DANO,
  GRUPO_DANO,
  gruposQueAtiende,
  gruposQueVe,
  puedeEditarDano,
  TIPOS_DANO,
  tiposDe,
  type GrupoDano,
  type Dano,
  type EstadoDano,
  type TipoDano,
} from "../../shared/danos";
import type { AulaConEstado, Sesion } from "../../shared/tipos";
import { api, leerToken, NoAutorizado } from "../api";
import { comprimir } from "../comprimir";
import { duracion, fechaCorta, minutosDesde } from "../formato";
import FotosReporte from "../FotosReporte";
import Icono from "../Icono";

interface Props {
  sesion: Sesion;
  onNoAutorizado: () => void;
}

const ICONO_GRUPO = { tecnologia: "chromebook", local: "edificio" } as const;
const MAX_FOTOS = 3;

// Equipos tecnológicos dañados y desperfectos del local. Va aparte de las incidencias de TI: no cambia el
// semáforo de las aulas ni las métricas. Quién ve y quién atiende cada grupo está en shared/danos.ts.
export default function Danos({ sesion, onNoAutorizado }: Props) {
  const esTi = sesion.rol === "ti";
  const visibles = gruposQueVe(sesion.rol);
  const atiende = gruposQueAtiende(sesion.rol);
  const [grupo, setGrupo] = useState<GrupoDano | null>(null);
  const [resueltos, setResueltos] = useState(false);
  const [danos, setDanos] = useState<Dano[] | null>(null);
  const [registrando, setRegistrando] = useState(false);
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(() => {
    const filtro = new URLSearchParams({ estado: resueltos ? "resueltos" : "abiertos", ...(grupo ? { grupo } : {}) });
    api<Dano[]>(`/api/danos?${filtro}`)
      .then(setDanos)
      .catch((e) => (e instanceof NoAutorizado ? onNoAutorizado() : setDanos([])));
  }, [grupo, resueltos, onNoAutorizado]);

  useEffect(cargar, [cargar]);

  async function cambiar(d: Dano, estado: EstadoDano, nota?: string) {
    try {
      await api(`/api/danos/${d.id}`, { method: "PATCH", body: JSON.stringify({ estado, nota_cierre: nota }) });
      setAviso(estado === "resuelto" ? `Daño de ${d.aula_nombre} marcado como resuelto.` : "");
      cargar();
    } catch (e) {
      if (e instanceof NoAutorizado) onNoAutorizado();
      else setAviso((e as Error).message);
    }
  }

  return (
    <div className="danos">
      <div className="cabecera-pagina">
        <div>
          <h1>Daños y mantenimiento</h1>
          <p className="subtitulo">
            {esTi
              ? `Chromebooks, laptops y proyectores dañados. ${EQUIPO_DANOS} también los ve. No cuentan en las incidencias de TI.`
              : "Desperfectos del local: ventiladores, paredes, mobiliario, puertas, luz. También ves los equipos dañados, que atiende TI."}
          </p>
        </div>
        {atiende.length > 0 && !registrando && (
          <button className="primario" onClick={() => setRegistrando(true)}>
            Registrar daño
          </button>
        )}
      </div>

      {registrando && (
        <FormDano
          grupos={atiende}
          onNoAutorizado={onNoAutorizado}
          onCancelar={() => setRegistrando(false)}
          onGuardado={(mensaje) => {
            setRegistrando(false);
            setAviso(mensaje);
            cargar();
          }}
        />
      )}
      {aviso && <p className="aviso ok" role="status">{aviso}</p>}

      <div className="filtros-danos">
        {visibles.length > 1 && (
          <div className="chips" role="group" aria-label="Qué está dañado">
            {[null, ...visibles].map((g) => (
              <button key={g ?? "todos"} className={grupo === g ? "chip activo" : "chip"} aria-pressed={grupo === g} onClick={() => setGrupo(g)}>
                {g ? `${GRUPO_DANO[g]} · ${ETIQUETA_ATIENDE[ATIENDE_DANO[g]]}` : "Todos"}
              </button>
            ))}
          </div>
        )}
        <div className="segmentado compacto" role="group" aria-label="Estado">
          <button className={!resueltos ? "activo" : ""} onClick={() => setResueltos(false)}>
            Por atender
          </button>
          <button className={resueltos ? "activo" : ""} onClick={() => setResueltos(true)}>
            Resueltos
          </button>
        </div>
      </div>

      {danos === null && <p className="vacio">Cargando…</p>}
      {danos?.length === 0 && (
        <p className="vacio">{resueltos ? "Todavía no hay daños resueltos." : "No hay daños por atender."}</p>
      )}
      <ul className="lista-danos">
        {danos?.map((d) => <FilaDano key={d.id} dano={d} editable={puedeEditarDano(sesion.rol, d.grupo)} onCambiar={cambiar} />)}
      </ul>
    </div>
  );
}

function FilaDano({ dano: d, editable, onCambiar }: { dano: Dano; editable: boolean; onCambiar: (d: Dano, e: EstadoDano, nota?: string) => void }) {
  const [cerrando, setCerrando] = useState(false);
  const [nota, setNota] = useState("");
  const datosEquipo = [d.equipo && `Código ${d.equipo}`, d.seccion && `Sección ${d.seccion}`, d.estudiante].filter(Boolean);
  return (
    <li className={`tarjeta dano ${d.estado}`}>
      <div className="dano-cabecera">
        <span className={`tipo-icono grupo-${d.grupo}`}>
          <Icono nombre={ICONO_GRUPO[d.grupo]} />
        </span>
        <div>
          <p className="dano-titulo">
            <strong>{d.aula_nombre}</strong>
            <span>{TIPOS_DANO[d.tipo]?.etiqueta ?? d.tipo}</span>
            <span className={`insignia estado-dano ${d.estado}`}>{ETIQUETA_ESTADO_DANO[d.estado]}</span>
          </p>
          <small>
            {GRUPO_DANO[d.grupo]} · hace {duracion(minutosDesde(d.reportado_en))} · {d.reportado_por}
          </small>
          {datosEquipo.length > 0 && <p className="dano-datos">{datosEquipo.join(" · ")}</p>}
          {d.descripcion && <p className="descripcion">“{d.descripcion}”</p>}
          {d.estado === "resuelto" && (
            <p className="dano-cierre">
              Resuelto el {fechaCorta(d.resuelto_en ?? d.reportado_en)}
              {d.actualizado_por ? ` por ${d.actualizado_por}` : ""}
              {d.nota_cierre ? `: ${d.nota_cierre}` : ""}
            </p>
          )}
          {d.fotos > 0 && <FotosReporte reporteId={d.id} total={d.fotos} ruta={`/api/danos/${d.id}/fotos`} />}
        </div>
      </div>
      {editable &&
        d.estado !== "resuelto" &&
        (cerrando ? (
          <form
            className="cerrar-dano"
            onSubmit={(e) => {
              e.preventDefault();
              onCambiar(d, "resuelto", nota);
            }}
          >
            <label>
              ¿Qué se hizo?
              <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} placeholder="Ej. Se cambió el cintillo y se avisó a la familia" autoFocus />
            </label>
            <div className="acciones">
              <button type="button" onClick={() => setCerrando(false)}>
                Cancelar
              </button>
              <button className="primario" type="submit">
                Marcar resuelto
              </button>
            </div>
          </form>
        ) : (
          <div className="acciones">
            {d.estado === "pendiente" && <button onClick={() => onCambiar(d, "en_proceso")}>En proceso</button>}
            <button className="primario" onClick={() => setCerrando(true)}>
              Resolver
            </button>
          </div>
        ))}
    </li>
  );
}

function FormDano({
  grupos,
  onGuardado,
  onCancelar,
  onNoAutorizado,
}: {
  grupos: GrupoDano[];
  onGuardado: (mensaje: string) => void;
  onCancelar: () => void;
  onNoAutorizado: () => void;
}) {
  const [aulas, setAulas] = useState<AulaConEstado[]>([]);
  const [aulaId, setAulaId] = useState<number | null>(null);
  const [grupo, setGrupo] = useState<GrupoDano>(grupos[0]);
  const [tipo, setTipo] = useState<TipoDano | null>(null);
  const [equipo, setEquipo] = useState("");
  const [seccion, setSeccion] = useState("");
  const [estudiante, setEstudiante] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [fotos, setFotos] = useState<Blob[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<AulaConEstado[]>("/api/aulas")
      .then(setAulas)
      .catch((e) => (e instanceof NoAutorizado ? onNoAutorizado() : null));
  }, [onNoAutorizado]);

  const tecnologia = grupo === "tecnologia";

  async function elegirFotos(lista: FileList | null) {
    const elegidas = [...(lista ?? [])].slice(0, MAX_FOTOS - fotos.length);
    const nuevas: Blob[] = [];
    for (const f of elegidas) nuevas.push(await comprimir(f).catch(() => f));
    setFotos([...fotos, ...nuevas]);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!aulaId || !tipo) return;
    setGuardando(true);
    setError("");
    try {
      const { id } = await api<{ id: number }>("/api/danos", {
        method: "POST",
        body: JSON.stringify({ aula_id: aulaId, tipo, equipo, seccion, estudiante, descripcion }),
      });
      let fallidas = 0;
      const token = leerToken();
      for (const foto of fotos) {
        const res = await fetch(`/api/danos/${id}/foto`, {
          method: "PUT",
          headers: { "Content-Type": foto.type || "image/jpeg", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: foto,
        }).catch(() => null);
        if (!res?.ok) fallidas++;
      }
      onGuardado(
        `Daño registrado.${tecnologia ? ` ${EQUIPO_DANOS} también lo ve.` : ""}${fallidas ? ` ${fallidas === 1 ? "Una foto no se pudo subir" : `${fallidas} fotos no se pudieron subir`}.` : ""}`,
      );
    } catch (err) {
      if (err instanceof NoAutorizado) onNoAutorizado();
      else setError((err as Error).message);
      setGuardando(false);
    }
  }

  return (
    <form className="tarjeta form-dano" onSubmit={enviar}>
      <label>
        Aula o ambiente
        <select
          value={aulaId ?? ""}
          onChange={(e) => {
            const id = Number(e.target.value) || null;
            setAulaId(id);
            const elegida = aulas.find((a) => a.id === id);
            if (elegida?.seccion && !seccion) setSeccion(elegida.seccion);
          }}
          required
        >
          <option value="">Elige…</option>
          {aulas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
              {a.seccion ? ` · ${a.seccion}` : ""}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>¿Qué está dañado?</legend>
        {grupos.length > 1 && (
          <div className="opciones-falla dos">
            {grupos.map((g) => (
              <button
                type="button"
                key={g}
                className={grupo === g ? "opcion activo" : "opcion"}
                aria-pressed={grupo === g}
                onClick={() => {
                  setGrupo(g);
                  setTipo(null);
                }}
              >
                <Icono nombre={ICONO_GRUPO[g]} />
                {GRUPO_DANO[g]}
              </button>
            ))}
          </div>
        )}
        <div className="chips tipos-dano" role="group" aria-label="Tipo de daño">
          {tiposDe(grupo).map((t) => (
            <button type="button" key={t} className={tipo === t ? "chip activo" : "chip"} aria-pressed={tipo === t} onClick={() => setTipo(t)}>
              {TIPOS_DANO[t].etiqueta}
            </button>
          ))}
        </div>
      </fieldset>
      {tecnologia && (
        <div className="fila-campos">
          <label>
            Código del equipo (opcional)
            <input value={equipo} onChange={(e) => setEquipo(e.target.value)} placeholder="Ej. CB-ML-12" maxLength={40} />
          </label>
          <label>
            Sección
            <input value={seccion} onChange={(e) => setSeccion(e.target.value)} placeholder="Ej. 5A" maxLength={20} />
          </label>
          <label>
            Estudiante (opcional)
            <input value={estudiante} onChange={(e) => setEstudiante(e.target.value)} maxLength={80} />
            <small className="nota-campo">Solo lo ven TI y {EQUIPO_DANOS}.</small>
          </label>
        </div>
      )}
      <label>
        {tipo?.endsWith("_otro") ? "Describe el daño" : "Detalle (opcional)"}
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={2}
          placeholder={tecnologia ? "Ej. La pantalla tiene una rajadura en la esquina" : "Ej. El ventilador hace ruido y no gira"}
          required={tipo?.endsWith("_otro")}
        />
      </label>
      <label className="boton-archivo">
        <Icono nombre="camara" />
        {fotos.length ? `Fotos: ${fotos.length} de ${MAX_FOTOS}` : "Agregar fotos (opcional)"}
        <input type="file" accept="image/*" multiple hidden disabled={fotos.length >= MAX_FOTOS} onChange={(e) => elegirFotos(e.target.files)} />
      </label>
      <div className="acciones">
        <button type="button" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </button>
        <button className="primario" type="submit" disabled={!aulaId || !tipo || guardando}>
          {guardando ? "Guardando…" : "Registrar daño"}
        </button>
      </div>
      {error && <p className="aviso error">{error}</p>}
    </form>
  );
}
