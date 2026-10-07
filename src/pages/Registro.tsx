import { useEffect, useState } from "react";
import type { AulaConEstado, TipoFalla } from "../../shared/tipos";
import { api, NoAutorizado } from "../api";

const TIPOS: { valor: TipoFalla; etiqueta: string }[] = [
  { valor: "internet", etiqueta: "Internet" },
  { valor: "proyector", etiqueta: "Proyector" },
  { valor: "pc", etiqueta: "PC" },
  { valor: "otro", etiqueta: "Otro" },
];

// Registro rápido: lo que TI llena al leer el mensaje de WhatsApp
export default function Registro({ onNoAutorizado }: { onNoAutorizado: () => void }) {
  const [aulas, setAulas] = useState<AulaConEstado[]>([]);
  const [aulaTexto, setAulaTexto] = useState("");
  const [tipo, setTipo] = useState<TipoFalla | null>(null);
  const [bloquea, setBloquea] = useState(false);
  const [docente, setDocente] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api<AulaConEstado[]>("/api/aulas")
      .then(setAulas)
      .catch((e) => (e instanceof NoAutorizado ? onNoAutorizado() : null));
  }, [onNoAutorizado]);

  const aula = aulas.find((a) => a.nombre === aulaTexto || a.codigo === aulaTexto);

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
          bloquea_clase: bloquea,
          reportado_por_nombre: docente,
          descripcion,
        }),
      });
      setMensaje({ ok: true, texto: `Registrado: ${aula.nombre}` });
      setAulaTexto("");
      setTipo(null);
      setBloquea(false);
      setDocente("");
      setDescripcion("");
    } catch (err) {
      if (err instanceof NoAutorizado) return onNoAutorizado();
      setMensaje({ ok: false, texto: "No se pudo registrar. Intenta de nuevo." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="tarjeta registro" onSubmit={enviar}>
      <h2>Registro rápido</h2>

      <label>
        Aula
        <input
          list="lista-aulas"
          value={aulaTexto}
          onChange={(e) => setAulaTexto(e.target.value)}
          placeholder="Escribe 204 o Aula 204"
          inputMode="search"
        />
        <datalist id="lista-aulas">
          {aulas.map((a) => (
            <option key={a.id} value={a.nombre} />
          ))}
        </datalist>
      </label>

      <fieldset>
        <legend>Tipo de falla</legend>
        <div className="chips">
          {TIPOS.map((t) => (
            <button
              type="button"
              key={t.valor}
              className={tipo === t.valor ? "chip activo" : "chip"}
              onClick={() => setTipo(t.valor)}
            >
              {t.etiqueta}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>¿Bloquea la clase ahora mismo?</legend>
        <div className="chips">
          <button type="button" className={bloquea ? "chip peligro activo" : "chip"} onClick={() => setBloquea(true)}>
            Sí
          </button>
          <button type="button" className={!bloquea ? "chip activo" : "chip"} onClick={() => setBloquea(false)}>
            No
          </button>
        </div>
      </fieldset>

      <label>
        Docente que reporta (opcional)
        <input value={docente} onChange={(e) => setDocente(e.target.value)} />
      </label>

      <label>
        Detalle (opcional)
        <textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </label>

      <button className="primario" type="submit" disabled={!aula || !tipo || enviando}>
        {enviando ? "Registrando…" : "Registrar incidencia"}
      </button>
      {mensaje && <p className={mensaje.ok ? "aviso ok" : "aviso error"}>{mensaje.texto}</p>}
    </form>
  );
}
