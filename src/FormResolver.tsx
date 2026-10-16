import { useEffect, useState } from "react";
import type { Similares } from "../shared/tipos";
import { api } from "./api";
import { fechaCorta } from "./formato";

interface Props {
  reporteId: number;
  aulaId: number;
  onGuardar: (causa: string, hice: string) => Promise<void>;
  onCancelar: () => void;
}

// Cierre de un reporte en dos partes: lo que se encontró y lo que se hizo.
// Así cada caso queda ordenado para el asistente del Sprint 3.
export default function FormResolver({ reporteId, aulaId, onGuardar, onCancelar }: Props) {
  const [causa, setCausa] = useState("");
  const [hice, setHice] = useState("");
  const [similares, setSimilares] = useState<Similares | null>(null);

  // Cómo se resolvieron antes fallas parecidas, para no empezar de cero
  useEffect(() => {
    let vivo = true;
    api<Similares>(`/api/reportes/${reporteId}/similares`)
      .then((s) => vivo && setSimilares(s))
      .catch(() => null);
    return () => {
      vivo = false;
    };
  }, [reporteId]);
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
      {similares && (similares.casos.length > 0 || similares.fichas.length > 0) && (
        <div className="similares">
          <h3>Casos parecidos</h3>
          <ul>
            {similares.casos.map((c) => (
              <li key={c.id}>
                <div>
                  <strong>
                    {c.aula_id === aulaId ? "En esta aula" : c.aula_nombre} · {fechaCorta(c.resuelto_en ?? c.reportado_en)}
                  </strong>
                  {c.descripcion && <small>“{c.descripcion}”</small>}
                  {c.causa && <p>Causa: {c.causa}</p>}
                  {c.notas_resolucion && <p>Se hizo: {c.notas_resolucion}</p>}
                </div>
                <button
                  type="button"
                  className="enlace"
                  onClick={() => {
                    setCausa(c.causa ?? "");
                    setHice(c.notas_resolucion ?? "");
                  }}
                >
                  Usar
                </button>
              </li>
            ))}
            {similares.fichas.map((f) => (
              <li key={`f${f.id}`} className="ficha-similar">
                <div>
                  <strong>Ficha: {f.titulo}</strong>
                  {f.causas_posibles && <p>Causas posibles: {f.causas_posibles}</p>}
                  {f.pasos_ti ? (
                    <p>Procedimiento de TI: {f.pasos_ti.split("\n").filter(Boolean).join(" · ")}</p>
                  ) : (
                    f.pasos_docente && <p>Lo que puede probar el docente: {f.pasos_docente.split("\n").filter(Boolean).join(" · ")}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
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
