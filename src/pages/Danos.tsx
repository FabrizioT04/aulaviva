import { useCallback, useEffect, useState } from "react";
import {
  ETIQUETA_AREA,
  ETIQUETA_ESTADO_DANO,
  GRUPO_DANO,
  TIPOS_DANO,
  tiposDe,
  type AreaDano,
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

const ICONO_AREA = { coa: "chromebook", mantenimiento: "edificio" } as const;
const MAX_FOTOS = 3;

// Chromebooks dañadas (COA) y desperfectos del local (Mantenimiento). Va aparte de las incidencias de TI:
// no cambia el semáforo de las aulas ni las métricas. COA y Mantenimiento solo ven esta pestaña y lo de su área.
export default function Danos({ sesion, onNoAutorizado }: Props) {
  const propia = sesion.rol === "coa" || sesion.rol === "mantenimiento" ? sesion.rol : null;
  const [area, setArea] = useState<AreaDano | null>(propia);
  const [resueltos, setResueltos] = useState(false);
  const [danos, setDanos] = useState<Dano[] | null>(null);
  const [registrando, setRegistrando] = useState(false);
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(() => {
    const filtro = new URLSearchParams({ estado: resueltos ? "resueltos" : "abiertos", ...(area ? { area } : {}) });
    api<Dano[]>(`/api/danos?${filtro}`)
      .then(setDanos)
      .catch((e) => (e instanceof NoAutorizado ? onNoAutorizado() : setDanos([])));
  }, [area, resueltos, onNoAutorizado]);

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
            {propia === "coa"
              ? "Chromebooks dañadas por estudiantes: golpes, cintillo de seguridad roto, manchas o piezas faltantes."
              : propia === "mantenimiento"
                ? "Desperfectos del local: ventiladores, paredes, mobiliario, puertas, luz y tomacorrientes."
                : "Chromebooks dañadas (las ve COA) y desperfectos del local (los ve Mantenimiento). No cuentan en las incidencias de TI."}
          </p>
        </div>
        {!registrando && (
          <button className="primario" onClick={() => setRegistrando(true)}>
            Registrar daño
          </button>
        )}
      </div>

      {registrando && (
        <FormDano
          areaInicial={propia ?? "coa"}
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
        {!propia && (
          <div className="chips" role="group" aria-label="Área">
            {([null, "coa", "mantenimiento"] as const).map((a) => (
              <button key={a ?? "todas"} className={area === a ? "chip activo" : "chip"} aria-pressed={area === a} onClick={() => setArea(a)}>
                {a ? `${GRUPO_DANO[a]} · ${ETIQUETA_AREA[a]}` : "Todos"}
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
        {danos?.map((d) => <FilaDano key={d.id} dano={d} onCambiar={cambiar} />)}
      </ul>
    </div>
  );
}

function FilaDano({ dano: d, onCambiar }: { dano: Dano; onCambiar: (d: Dano, e: EstadoDano, nota?: string) => void }) {
  const [cerrando, setCerrando] = useState(false);
  const [nota, setNota] = useState("");
  const datosChromebook = [d.equipo && `Chromebook ${d.equipo}`, d.seccion && `Sección ${d.seccion}`, d.estudiante].filter(Boolean);
  return (
    <li className={`tarjeta dano ${d.estado}`}>
      <div className="dano-cabecera">
        <span className={`tipo-icono area-${d.area}`}>
          <Icono nombre={ICONO_AREA[d.area]} />
        </span>
        <div>
          <p className="dano-titulo">
            <strong>{d.aula_nombre}</strong>
            <span>{TIPOS_DANO[d.tipo]?.etiqueta ?? d.tipo}</span>
            <span className={`insignia estado-dano ${d.estado}`}>{ETIQUETA_ESTADO_DANO[d.estado]}</span>
          </p>
          <small>
            {GRUPO_DANO[d.area]} · {ETIQUETA_AREA[d.area]} · hace {duracion(minutosDesde(d.reportado_en))} · {d.reportado_por}
          </small>
          {datosChromebook.length > 0 && <p className="dano-datos">{datosChromebook.join(" · ")}</p>}
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
      {d.estado !== "resuelto" &&
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
  areaInicial,
  onGuardado,
  onCancelar,
  onNoAutorizado,
}: {
  areaInicial: AreaDano;
  onGuardado: (mensaje: string) => void;
  onCancelar: () => void;
  onNoAutorizado: () => void;
}) {
  const [aulas, setAulas] = useState<AulaConEstado[]>([]);
  const [aulaId, setAulaId] = useState<number | null>(null);
  const [area, setArea] = useState<AreaDano>(areaInicial);
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

  const chromebook = area === "coa";

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
        `Daño registrado para ${ETIQUETA_AREA[area]}.${fallidas ? ` ${fallidas === 1 ? "Una foto no se pudo subir" : `${fallidas} fotos no se pudieron subir`}.` : ""}`,
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
        <div className="opciones-falla dos">
          {(["coa", "mantenimiento"] as const).map((a) => (
            <button
              type="button"
              key={a}
              className={area === a ? "opcion activo" : "opcion"}
              aria-pressed={area === a}
              onClick={() => {
                setArea(a);
                setTipo(null);
              }}
            >
              <Icono nombre={ICONO_AREA[a]} />
              {GRUPO_DANO[a]}
              <small>Lo ve {ETIQUETA_AREA[a]}</small>
            </button>
          ))}
        </div>
        <div className="chips tipos-dano" role="group" aria-label="Tipo de daño">
          {tiposDe(area).map((t) => (
            <button type="button" key={t} className={tipo === t ? "chip activo" : "chip"} aria-pressed={tipo === t} onClick={() => setTipo(t)}>
              {TIPOS_DANO[t].etiqueta}
            </button>
          ))}
        </div>
      </fieldset>
      {chromebook && (
        <div className="fila-campos">
          <label>
            Código de la Chromebook
            <input value={equipo} onChange={(e) => setEquipo(e.target.value)} placeholder="Ej. CB-ML-12" maxLength={40} />
          </label>
          <label>
            Sección
            <input value={seccion} onChange={(e) => setSeccion(e.target.value)} placeholder="Ej. 5A" maxLength={20} />
          </label>
          <label>
            Estudiante (opcional)
            <input value={estudiante} onChange={(e) => setEstudiante(e.target.value)} maxLength={80} />
            <small className="nota-campo">Solo lo ven TI, COA y Mantenimiento.</small>
          </label>
        </div>
      )}
      <label>
        {tipo?.endsWith("_otro") ? "Describe el daño" : "Detalle (opcional)"}
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={2}
          placeholder={chromebook ? "Ej. La pantalla tiene una rajadura en la esquina" : "Ej. El ventilador hace ruido y no gira"}
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
          {guardando ? "Guardando…" : `Enviar a ${ETIQUETA_AREA[area]}`}
        </button>
      </div>
      {error && <p className="aviso error">{error}</p>}
    </form>
  );
}
