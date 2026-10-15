import { useCallback, useEffect, useState } from "react";
import type { Ficha, TipoFalla } from "../../shared/tipos";
import { api, NoAutorizado } from "../api";
import { ETIQUETA_FALLA } from "../formato";
import Icono from "../Icono";

interface Props {
  onNoAutorizado: () => void;
}

const TIPOS: TipoFalla[] = ["internet", "proyector", "pc", "otro"];

type Borrador = Pick<Ficha, "tipo_falla" | "titulo" | "sintomas" | "pasos_docente" | "cuando_llamar_ti">;

const VACIA: Borrador = { tipo_falla: "proyector", titulo: "", sintomas: "", pasos_docente: "", cuando_llamar_ti: "" };

// Fichas que escribe TI con la solución de las fallas comunes.
// Son lo primero que consultará el asistente del Sprint 3.
export default function Fichas({ onNoAutorizado }: Props) {
  const [fichas, setFichas] = useState<Ficha[] | null>(null);
  // null = sin formulario, 0 = ficha nueva, n = editando la ficha n
  const [editando, setEditando] = useState<number | null>(null);

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

  return (
    <div className="fichas">
      <div className="cabecera-pagina">
        <div>
          <h1>Fichas de solución</h1>
          <p className="subtitulo">
            Lo que un docente puede probar antes de llamar a TI. El asistente usará estas fichas y los casos resueltos
            para sugerir soluciones desde el QR del aula.
          </p>
        </div>
        {editando === null && (
          <button className="primario" onClick={() => setEditando(0)}>
            Nueva ficha
          </button>
        )}
      </div>

      {editando === 0 && <FormFicha inicial={VACIA} onGuardar={guardar} onCancelar={() => setEditando(null)} />}

      {fichas === null && <p className="vacio">Cargando…</p>}
      {fichas?.length === 0 && editando === null && (
        <p className="vacio">Todavía no hay fichas. Empieza por la falla que más se repite.</p>
      )}

      {TIPOS.map((tipo) => {
        const delTipo = fichas?.filter((f) => f.tipo_falla === tipo) ?? [];
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
                  {f.pasos_docente && (
                    <ol>
                      {f.pasos_docente
                        .split("\n")
                        .map((p) => p.trim())
                        .filter(Boolean)
                        .map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                    </ol>
                  )}
                  {f.cuando_llamar_ti && (
                    <p className="llamar-ti">
                      <strong>Llama a TI:</strong> {f.cuando_llamar_ti}
                    </p>
                  )}
                  {editando === null && (
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
        Qué puede probar el docente (un paso por línea)
        <textarea
          {...campo("pasos_docente")}
          rows={4}
          placeholder={"Revisa que el cable HDMI esté bien conectado\nPresiona Windows + P y elige Duplicar"}
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
