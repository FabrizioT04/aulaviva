import { useEffect, useRef, useState } from "react";
import Icono from "./Icono";
import "./confirmar-eliminacion.css";

interface Props {
  detalle: string;
  onCancelar: () => void;
  onConfirmar: () => Promise<void>;
}

export default function ConfirmarEliminacion({ detalle, onCancelar, onConfirmar }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const ocupado = useRef(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const elemento = dialogo.current!;
    const anterior = document.activeElement;
    const overflow = document.body.style.overflow;
    elemento.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      elemento.close();
      document.body.style.overflow = overflow;
      if (anterior instanceof HTMLElement && anterior.isConnected) anterior.focus();
    };
  }, []);

  async function confirmar() {
    if (ocupado.current) return;
    ocupado.current = true;
    setEnviando(true);
    setError("");
    try {
      await onConfirmar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar. Intenta nuevamente.");
    } finally {
      ocupado.current = false;
      setEnviando(false);
    }
  }

  return (
    <dialog ref={dialogo} className="confirmar-eliminacion"
      aria-labelledby="eliminar-titulo" aria-describedby="eliminar-detalle eliminar-aviso"
      onCancel={(e) => { e.preventDefault(); if (!ocupado.current) onCancelar(); }}>
      <div className="confirmar-eliminacion-icono"><Icono nombre="alerta" /></div>
      <h2 id="eliminar-titulo">¿Eliminar este registro?</h2>
      <p className="confirmar-eliminacion-detalle" id="eliminar-detalle">{detalle}</p>
      <p id="eliminar-aviso">Se borrarán sus datos y fotos y se actualizarán las estadísticas. <strong>Esta acción no se puede deshacer.</strong></p>
      {error && <p className="aviso error" role="alert">{error}</p>}
      <div className="confirmar-eliminacion-acciones" aria-busy={enviando}>
        <button type="button" autoFocus disabled={enviando} onClick={onCancelar}>Cancelar</button>
        <button type="button" className="confirmar-eliminacion-boton" disabled={enviando} onClick={confirmar}>
          {enviando ? "Eliminando…" : "Sí, eliminar"}
        </button>
      </div>
    </dialog>
  );
}
