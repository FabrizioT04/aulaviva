import { useCallback, useEffect, useState } from "react";
import type { Ficha, TipoFalla } from "../../shared/tipos";
import { TIPOS_FALLA } from "../../shared/tipos";
import { api, NoAutorizado } from "../api";
import { ETIQUETA_FALLA } from "../formato";
import Icono from "../Icono";

interface Props {
  onNoAutorizado: () => void;
  soloLectura?: boolean; // COA / Mantenimiento: consulta las fichas pero no las cambia
}

const TIPOS = TIPOS_FALLA;

type Borrador = Pick<
  Ficha,
  "tipo_falla" | "titulo" | "sintomas" | "causas_posibles" | "pasos_docente" | "pasos_ti" | "cuando_llamar_ti"
>;

const VACIA: Borrador = {
  tipo_falla: "proyector",
  titulo: "",
  sintomas: "",
  causas_posibles: "",
  pasos_docente: "",
  pasos_ti: "",
  cuando_llamar_ti: "",
};

// Sin mayúsculas ni tildes, para que "camara" encuentre "Cámara"
const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const pasos = (texto: string | null) =>
  (texto ?? "")
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);

// Fichas que escribe TI con la solución de las fallas comunes.
// Son lo primero que consultará el asistente del Sprint 3.
export default function Fichas({ onNoAutorizado, soloLectura }: Props) {
  const [fichas, setFichas] = useState<Ficha[] | null>(null);
  // null = sin formulario, 0 = ficha nueva, n = editando la ficha n
  const [editando, setEditando] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<TipoFalla | null>(null);

  const cargar = useCallback(() => {
    api<Ficha[]>("/api/fichas")
      .then(setFichas)
      .catch((e) => (e instanceof NoAutorizado ? onNoAutorizado() : setFichas([])));
  }, [onNoAutorizado]);

  useEffect(cargar, [cargar]);

  async function guardar(datos: Borrador) {
    try {
      await api(editando ? `/api/fichas/${editando}` : "/api/fichas", {
        method: editando ? "PUT" : "POST",
        body: JSON.stringify(datos),
      });
      setEditando(null);
      cargar();
    } catch (e) {
      if (e instanceof NoAutorizado) return onNoAutorizado();
      throw e;
    }
  }

  async function borrar(ficha: Ficha) {
    if (!confirm(`¿Borrar la ficha "${ficha.titulo}"?`)) return;
    try {
      await api(`/api/fichas/${ficha.id}`, { method: "DELETE" });
      cargar();
    } catch (e) {
      if (e instanceof NoAutorizado) onNoAutorizado();
    }
  }

  const enEdicion = fichas?.find((f) => f.id === editando);
  const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);
  const coincide = (f: Ficha) => {
    if (filtro && f.tipo_falla !== filtro) return false;
    const texto = normalizar(
      [f.titulo, f.sintomas, f.causas_posibles, f.pasos_docente, f.pasos_ti, f.cuando_llamar_ti, ETIQUETA_FALLA[f.tipo_falla]].join(" "),
    );
    return palabras.every((p) => texto.includes(p));
  };
  const visibles = fichas?.filter(coincide) ?? [];
  const conFichas = TIPOS.filter((tipo) => fichas?.some((f) => f.tipo_falla === tipo));

  return (
    <div className="fichas">
      <div className="cabecera-pagina">
        <div>
          <h1>Base de conocimiento</h1>
          <p className="subtitulo">
            Fichas de solución por tipo de falla: lo que el docente puede probar solo y el procedimiento de TI. Al
            resolver un reporte se muestran las fichas de su tipo, y el asistente las usará junto con los casos resueltos.
          </p>
        </div>
        {editando === null && !soloLectura && (
          <button className="primario" onClick={() => setEditando(0)}>
            Nueva ficha
          </button>
        )}
      </div>

      {editando === 0 && <FormFicha inicial={VACIA} onGuardar={guardar} onCancelar={() => setEditando(null)} />}

      {fichas === null && <p className="vacio">Cargando…</p>}
      {fichas?.length === 0 && editando === null && (
        <div className="tarjeta vacio-guia">
          <h2>Todavía no hay fichas</h2>
          <p>
            Empieza por la falla que más se repite (el Observatorio te dice cuál). Cada ficha guarda cómo se ve la falla,
            sus causas posibles, lo que el docente puede probar solo y el procedimiento de TI.
          </p>
        </div>
      )}

      {fichas && fichas.length > 0 && (
        <div className="filtros-fichas">
          <label className="buscador">
            <Icono nombre="buscar" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar: sin señal, HDMI, no imprime…"
              aria-label="Buscar en las fichas"
            />
          </label>
          {conFichas.length > 1 && (
            <div className="chips" role="group" aria-label="Filtrar por tipo de falla">
              <button className={filtro === null ? "chip activo" : "chip"} onClick={() => setFiltro(null)}>
                Todas
              </button>
              {conFichas.map((tipo) => (
                <button
                  key={tipo}
                  className={filtro === tipo ? "chip activo" : "chip"}
                  aria-pressed={filtro === tipo}
                  onClick={() => setFiltro(filtro === tipo ? null : tipo)}
                >
                  {ETIQUETA_FALLA[tipo]}
                </button>
              ))}
            </div>
          )}
          {(palabras.length > 0 || filtro) && (
            <p className="conteo-fichas">
              {visibles.length === 0
                ? "Ninguna ficha coincide."
                : visibles.length === 1
                  ? "1 ficha"
                  : `${visibles.length} fichas`}
            </p>
          )}
        </div>
      )}

      {TIPOS.map((tipo) => {
        const delTipo = visibles.filter((f) => f.tipo_falla === tipo);
        if (delTipo.length === 0) return null;
        return (
          <section key={tipo} className="grupo-fichas">
            <h2>
              <span className={`tipo-icono ${tipo}`}>
                <Icono nombre={tipo} />
              </span>
              {ETIQUETA_FALLA[tipo]} <span className="contador">{delTipo.length}</span>
            </h2>
            {delTipo.map((f) =>
              f.id === editando && enEdicion ? (
                <FormFicha key={f.id} inicial={enEdicion} onGuardar={guardar} onCancelar={() => setEditando(null)} />
              ) : (
                <article key={f.id} className="tarjeta ficha">
                  <h3>{f.titulo}</h3>
                  {f.sintomas && <p className="sintomas">{f.sintomas}</p>}
                  {f.causas_posibles && (
                    <p className="causas">
                      <strong>Causas posibles:</strong> {f.causas_posibles}
                    </p>
                  )}
                  {pasos(f.pasos_docente).length > 0 && (
                    <>
                      <h4 className="nivel docente">El docente puede intentarlo</h4>
                      <ol>
                        {pasos(f.pasos_docente).map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ol>
                    </>
                  )}
                  {pasos(f.pasos_ti).length > 0 && (
                    <>
                      <h4 className="nivel ti">Solo soporte TI</h4>
                      <ol>
                        {pasos(f.pasos_ti).map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ol>
                    </>
                  )}
                  {f.cuando_llamar_ti && (
                    <p className="llamar-ti">
                      <strong>Llama a TI:</strong> {f.cuando_llamar_ti}
                    </p>
                  )}
                  {editando === null && !soloLectura && (
                    <div className="acciones">
                      <button onClick={() => setEditando(f.id)}>Editar</button>
                      <button className="enlace peligro" onClick={() => borrar(f)}>
                        Borrar
                      </button>
                    </div>
                  )}
                </article>
              ),
            )}
          </section>
        );
      })}
    </div>
  );
}

interface FormProps {
  inicial: Borrador;
  onGuardar: (datos: Borrador) => Promise<void>;
  onCancelar: () => void;
}

function FormFicha({ inicial, onGuardar, onCancelar }: FormProps) {
  const [datos, setDatos] = useState<Borrador>(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const campo = (clave: keyof Borrador) => ({
    value: datos[clave] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDatos({ ...datos, [clave]: e.target.value }),
  });

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError("");
    try {
      await onGuardar(datos);
    } catch (err) {
      setError(err instanceof Error && !(err instanceof TypeError) ? err.message : "No se pudo guardar. Intenta de nuevo.");
      setGuardando(false);
    }
  }

  return (
    <form className="tarjeta ficha form-ficha" onSubmit={enviar}>
      <fieldset>
        <legend>Tipo de falla</legend>
        <div className="opciones-falla">
          {TIPOS.map((t) => (
            <button
              type="button"
              key={t}
              className={datos.tipo_falla === t ? "opcion activo" : "opcion"}
              aria-pressed={datos.tipo_falla === t}
              onClick={() => setDatos({ ...datos, tipo_falla: t })}
            >
              <Icono nombre={t} />
              {ETIQUETA_FALLA[t]}
            </button>
          ))}
        </div>
      </fieldset>
      <label>
        Título
        <input {...campo("titulo")} placeholder="Ej. El proyector no muestra la imagen de la laptop" autoFocus />
      </label>
      <label>
        ¿Cómo se ve la falla?
        <textarea {...campo("sintomas")} rows={2} placeholder="Ej. El proyector prende pero dice “Sin señal”" />
      </label>
      <label>
        Causas posibles
        <textarea {...campo("causas_posibles")} rows={2} placeholder="Ej. Cable HDMI suelto, entrada equivocada en el proyector" />
      </label>
      <label>
        Qué puede probar el docente (un paso por línea)
        <textarea
          {...campo("pasos_docente")}
          rows={4}
          placeholder={"Revisa que el cable HDMI esté bien conectado\nPresiona Super + P hasta que la imagen salga en el proyector"}
        />
        <small className="nota-campo">
          El docente ve estos pasos en el QR al elegir esta falla, antes de avisar a TI. Solo pasos seguros: nada de abrir
          equipos, tocar la instalación eléctrica ni cambiar configuraciones de red.
        </small>
      </label>
      <label>
        Procedimiento de TI (un paso por línea)
        <textarea
          {...campo("pasos_ti")}
          rows={4}
          placeholder={"Revisar el cable HDMI detrás del proyector\nCambiar la entrada a HDMI 1 desde el control\nProbar con otra laptop"}
        />
      </label>
      <label>
        ¿Cuándo llamar a TI?
        <textarea {...campo("cuando_llamar_ti")} rows={2} placeholder="Ej. Si después de 5 minutos sigue sin señal" />
      </label>
      <div className="acciones">
        <button type="button" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </button>
        <button className="primario" type="submit" disabled={!datos.titulo.trim() || guardando}>
          {guardando ? "Guardando…" : "Guardar ficha"}
        </button>
      </div>
      {error && <p className="aviso error">{error}</p>}
    </form>
  );
}
