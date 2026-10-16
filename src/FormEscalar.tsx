import { useState } from "react";

interface Props {
  onGuardar: (ticket: string, observaciones: string) => Promise<void>;
  onCancelar: () => void;
}

// Cuando TI de la sede no puede resolverlo y lo deriva a GLPI: el número de ticket y qué queda pendiente
export default function FormEscalar({ onGuardar, onCancelar }: Props) {
  const [ticket, setTicket] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError("");
    try {
      await onGuardar(ticket, observaciones);
    } catch (err) {
      setError(err instanceof Error && !(err instanceof TypeError) ? err.message : "No se pudo guardar. Intenta de nuevo.");
      setGuardando(false);
    }
  }

  return (
    <form className="form-resolver" onSubmit={guardar}>
      <label>
        N.° de ticket GLPI
        <input value={ticket} onChange={(e) => setTicket(e.target.value)} placeholder="Ej. 4521" inputMode="numeric" maxLength={40} autoFocus />
      </label>
      <label>
        Observaciones (opcional)
        <textarea
          rows={2}
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          placeholder="Ej. parece la fuente del proyector; GLPI enviará un técnico"
        />
      </label>
      <div className="acciones">
        <button type="button" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </button>
        <button className="primario" type="submit" disabled={guardando}>
          {guardando ? "Guardando…" : "Marcar escalado"}
        </button>
      </div>
      {error && <p className="aviso error">{error}</p>}
    </form>
  );
}
