import { useCallback, useEffect, useState } from "react";
import { etiquetaFalla, fallasDe, type AulaConEstado, type TipoFalla } from "../shared/tipos";
import type { BorradorWhatsapp } from "../shared/whatsapp";
import { api, NoAutorizado } from "./api";
import { duracion, minutosDesde } from "./formato";
import { useEnVivo } from "./useEnVivo";

interface Props {
  aulas: AulaConEstado[];
  soloLectura?: boolean;
  onNoAutorizado: () => void;
}

// Mensajes del WhatsApp Business que todavía no son reporte: al docente le faltó decir el aula o la falla.
// Mientras Hazio espera su respuesta se ven como "Esperando al docente"; si no responde, TI los clasifica aquí.
export default function BandejaWhatsapp({ aulas, soloLectura, onNoAutorizado }: Props) {
  const [mensajes, setMensajes] = useState<BorradorWhatsapp[]>([]);

  const cargar = useCallback(() => {
    api<BorradorWhatsapp[]>("/api/whatsapp/bandeja")
      .then(setMensajes)
      .catch((e) => (e instanceof NoAutorizado ? onNoAutorizado() : null));
  }, [onNoAutorizado]);
  useEffect(cargar, [cargar]);
  useEnVivo((evento) => {
    if (!evento || evento.tipo === "whatsapp") cargar();
  });

  if (mensajes.length === 0) return null;
  return (
    <section className="tarjeta bandeja-wa" aria-label="Mensajes de WhatsApp por clasificar">
      <div className="tarjeta-cabecera">
        <h2>
          Por clasificar <span className="cuenta-wa">{mensajes.length}</span>
        </h2>
        <span className="nota">Mensajes de WhatsApp sin aula o sin falla</span>
      </div>
      <ul className="reportes">
        {mensajes.map((m) => (
          <Mensaje key={m.id} m={m} aulas={aulas} soloLectura={soloLectura} alTerminar={cargar} onNoAutorizado={onNoAutorizado} />
        ))}
      </ul>
    </section>
  );
}

function Mensaje({
  m,
  aulas,
  soloLectura,
  alTerminar,
  onNoAutorizado,
}: {
  m: BorradorWhatsapp;
  aulas: AulaConEstado[];
  soloLectura?: boolean;
  alTerminar: () => void;
  onNoAutorizado: () => void;
}) {
  const [aulaId, setAulaId] = useState<number | "">(m.aula_id ?? "");
  const [tipo, setTipo] = useState<TipoFalla | "">(m.tipo_falla ?? "");
  const [bloquea, setBloquea] = useState(Boolean(m.bloquea_clase));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const aula = aulas.find((a) => a.id === aulaId);
  const fallas = aula ? fallasDe(aula) : [];

  async function enviar(metodo: "POST" | "DELETE") {
    setGuardando(true);
    setError("");
    try {
      await api(`/api/whatsapp/bandeja/${m.id}`, {
        method: metodo,
        body: metodo === "POST" ? JSON.stringify({ aula_id: aulaId, tipo_falla: tipo, bloquea_clase: bloquea }) : undefined,
      });
      alTerminar();
    } catch (e) {
      if (e instanceof NoAutorizado) return onNoAutorizado();
      setError(e instanceof Error && !(e instanceof TypeError) ? e.message : "No se pudo guardar. Intenta de nuevo.");
      setGuardando(false);
    }
  }

  const quien = m.nombre ?? `+${m.telefono}`;
  return (
    <li className={m.bloquea_clase ? "reporte bloquea" : "reporte"}>
      <div className="reporte-titulo">
        <strong>{quien}</strong>
        {m.nombre && <span>+{m.telefono}</span>}
        {m.esperando ? <span className="insignia azul">Esperando al docente</span> : <span className="insignia sin-respuesta">Sin respuesta</span>}
        {m.bloquea_clase ? <span className="insignia roja">Urgente</span> : null}
      </div>
      <small>
        Hace {duracion(minutosDesde(m.recibido_en))} · por WhatsApp
        {m.fotos > 0 ? ` · ${m.fotos === 1 ? "1 foto" : `${m.fotos} fotos`}` : ""}
        {m.paso === "confirmar_aula" && m.aula_nombre ? ` · se le preguntó si es ${m.aula_nombre}` : ""}
        {m.paso === "aula" ? " · se le preguntó el aula" : ""}
        {m.paso === "falla" ? " · se le preguntó la falla" : ""}
      </small>
      {m.texto && <p className="descripcion">“{m.texto}”</p>}
      {!soloLectura && (
        <form
          className="form-resolver form-wa"
          onSubmit={(e) => {
            e.preventDefault();
            enviar("POST");
          }}
        >
          <label>
            Aula
            <select
              value={aulaId}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : "";
                setAulaId(id);
                const nueva = aulas.find((a) => a.id === id);
                if (nueva && tipo && !fallasDe(nueva).includes(tipo)) setTipo("");
              }}
              required
            >
              <option value="">Elige el aula</option>
              {aulas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                  {a.seccion ? ` (${a.seccion})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Falla
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoFalla)} required disabled={!aula}>
              <option value="">{aula ? "Elige la falla" : "Primero el aula"}</option>
              {fallas.map((t) => (
                <option key={t} value={t}>
                  {etiquetaFalla(t, aula?.equipo, aula?.espacio)}
                </option>
              ))}
            </select>
          </label>
          <label className="check-wa">
            <input type="checkbox" checked={bloquea} onChange={(e) => setBloquea(e.target.checked)} /> Bloquea la clase
          </label>
          <div className="acciones">
            <button type="button" onClick={() => enviar("DELETE")} disabled={guardando} title="No era un reporte">
              Descartar
            </button>
            <button className="primario" type="submit" disabled={guardando || !aula || !tipo}>
              {guardando ? "Guardando…" : "Registrar reporte"}
            </button>
          </div>
          {error && <p className="aviso error">{error}</p>}
        </form>
      )}
    </li>
  );
}
