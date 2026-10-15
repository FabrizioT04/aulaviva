import { useEffect, useState } from "react";
import type { AulaConEstado, TipoFalla } from "../../shared/tipos";
import { api, NoAutorizado } from "../api";

const TIPOS: { valor: TipoFalla; etiqueta: string }[] = [
  { valor: "internet", etiqueta: "Internet" },
  { valor: "proyector", etiqueta: "Proyector" },
  { valor: "pc", etiqueta: "PC" },
  { valor: "otro", etiqueta: "Otro" },
];

// Fecha y hora local en el formato que usa <input type="datetime-local">
function ahoraLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const aIso = (local: string) => new Date(local).toISOString();

// Registro rápido: lo que TI llena al leer el mensaje de WhatsApp
export default function Registro({ onNoAutorizado }: { onNoAutorizado: () => void }) {
  const [aulas, setAulas] = useState<AulaConEstado[]>([]);
  const [aulaTexto, setAulaTexto] = useState("");
  const [tipo, setTipo] = useState<TipoFalla | null>(null);
  const [bloquea, setBloquea] = useState(false);
  const [docente, setDocente] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [llegoEn, setLlegoEn] = useState(ahoraLocal);
  const [resuelto, setResuelto] = useState(false);
  const [atendidoEn, setAtendidoEn] = useState(ahoraLocal);
  const [resueltoEn, setResueltoEn] = useState(ahoraLocal);
  const [notas, setNotas] = useState("");
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
          reportado_en: aIso(llegoEn),
          ...(resuelto && {
            resuelto: true,
            atendido_en: aIso(atendidoEn),
            resuelto_en: aIso(resueltoEn),
            notas_resolucion: notas,
          }),
        }),
      });
      setMensaje({ ok: true, texto: `${resuelto ? "Registrado como resuelto" : "Registrado"}: ${aula.nombre}` });
      setAulaTexto("");
      setTipo(null);
      setBloquea(false);
      setDocente("");
      setDescripcion("");
      setLlegoEn(ahoraLocal());
      setResuelto(false);
      setAtendidoEn(ahoraLocal());
      setResueltoEn(ahoraLocal());
      setNotas("");
    } catch (err) {
      if (err instanceof NoAutorizado) return onNoAutorizado();
      setMensaje({ ok: false, texto: err instanceof Error && !(err instanceof TypeError) ? err.message : "No se pudo registrar. Intenta de nuevo." });
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

      <label>
        ¿A qué hora llegó el mensaje?
        <input type="datetime-local" value={llegoEn} max={ahoraLocal()} onChange={(e) => setLlegoEn(e.target.value)} />
      </label>

      <fieldset>
        <legend>¿Ya lo resolviste?</legend>
        <div className="chips">
          <button type="button" className={!resuelto ? "chip activo" : "chip"} onClick={() => setResuelto(false)}>
            No, queda pendiente
          </button>
          <button type="button" className={resuelto ? "chip activo" : "chip"} onClick={() => setResuelto(true)}>
            Sí, ya está resuelto
          </button>
        </div>
      </fieldset>

      {resuelto && (
        <>
          <div className="horas">
            <label>
              Llegué al aula
              <input type="datetime-local" value={atendidoEn} onChange={(e) => setAtendidoEn(e.target.value)} />
            </label>
            <label>
              Quedó resuelto
              <input type="datetime-local" value={resueltoEn} onChange={(e) => setResueltoEn(e.target.value)} />
            </label>
          </div>
          <label>
            ¿Qué hiciste para resolverlo?
            <textarea
              rows={3}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej. reinicié el switch del piso 3 y volvió el internet"
            />
          </label>
        </>
      )}

      <button
        className="primario"
        type="submit"
        disabled={!aula || !tipo || !llegoEn || (resuelto && (!atendidoEn || !resueltoEn || !notas.trim())) || enviando}
      >
        {enviando ? "Registrando…" : resuelto ? "Registrar como resuelto" : "Registrar incidencia"}
      </button>
      {mensaje && <p className={mensaje.ok ? "aviso ok" : "aviso error"}>{mensaje.texto}</p>}
    </form>
  );
}
