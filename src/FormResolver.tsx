import { useState } from "react";

interface Props {
  onGuardar: (causa: string, hice: string) => Promise<void>;
  onCancelar: () => void;
}

// Cierre de un reporte en dos partes: lo que se encontró y lo que se hizo.
// Así cada caso queda ordenado para el asistente del Sprint 3.
export default function FormResolver({ onGuardar, onCancelar }: Props) {
  const [causa, setCausa] = useState("");
  const [hice, setHice] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError("");
    try {
      await onGuardar(causa, hice);
    } catch (err) {
      setError(err instanceof Error && !(err instanceof TypeError) ? err.message : "No se pudo guardar. Intenta de nuevo.");
      setGuardando(false);
    }
  }

  return (
    <form className="form-resolver" onSubmit={guardar}>
      <label>
        ¿Qué encontraste? (causa, si la sabes)
        <textarea
          rows={2}
          value={causa}
          onChange={(e) => setCausa(e.target.value)}
          placeholder="Ej. el cable HDMI estaba suelto detrás del proyector"
          autoFocus
        />
      </label>
      <label>
        ¿Qué hiciste?
        <textarea
          rows={2}
          value={hice}
          onChange={(e) => setHice(e.target.value)}
          placeholder="Ej. lo ajusté y probé con la laptop del docente"
        />
      </label>
      <div className="acciones">
        <button type="button" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </button>
        <button className="primario" type="submit" disabled={!hice.trim() || guardando}>
          {guardando ? "Guardando…" : "Marcar resuelto"}
        </button>
      </div>
      {error && <p className="aviso error">{error}</p>}
    </form>
  );
}
