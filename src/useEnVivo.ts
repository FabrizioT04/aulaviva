import { useEffect, useRef, useState } from "react";
import type { EventoEnVivo } from "../shared/tipos";
import { urlEnVivo } from "./api";

const LATIDO_MS = 25_000;
// Sin respuesta en este tiempo, la conexión se da por muerta aunque el navegador no lo haya notado
const SIN_RESPUESTA_MS = 2 * LATIDO_MS + 10_000;

// Conexión en vivo con el Durable Object de la sede. Llama a alCambiar con cada evento, y con null
// cuando conviene recargar todo: al reconectar o al volver a la pestaña, por si se perdió algún aviso.
export function useEnVivo(alCambiar: (evento: EventoEnVivo | null) => void): boolean {
  const [conectado, setConectado] = useState(false);
  const alCambiarRef = useRef(alCambiar);
  useEffect(() => {
    alCambiarRef.current = alCambiar;
  });

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reintento: ReturnType<typeof setTimeout> | undefined;
    let ultimo = Date.now();
    let cerrado = false;
    let primera = true;

    function conectar() {
      clearTimeout(reintento);
      const nuevo = new WebSocket(urlEnVivo());
      ws = nuevo;
      nuevo.onopen = () => {
        ultimo = Date.now();
        setConectado(true);
        if (!primera) alCambiarRef.current(null);
        primera = false;
      };
      nuevo.onmessage = (e) => {
        ultimo = Date.now();
        if (e.data === "pong") return;
        alCambiarRef.current(JSON.parse(e.data) as EventoEnVivo);
      };
      nuevo.onclose = () => {
        if (ws !== nuevo) return;
        setConectado(false);
        if (!cerrado) reintento = setTimeout(conectar, 3000);
      };
    }

    // Cierra la conexión actual sin esperar a que el navegador lo note, y abre otra
    function reconectar() {
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
      setConectado(false);
      conectar();
    }

    conectar();

    // Latido: una conexión callada se puede cortar sin aviso y el panel deja de actualizarse
    const latido = setInterval(() => {
      if (ws?.readyState !== WebSocket.OPEN) return;
      if (Date.now() - ultimo > SIN_RESPUESTA_MS) return reconectar();
      ws.send("ping");
    }, LATIDO_MS);

    // Al volver a la pestaña (o al despertar la laptop) se pone al día
    function alVolver() {
      if (document.visibilityState !== "visible") return;
      if (ws?.readyState === WebSocket.OPEN && Date.now() - ultimo < SIN_RESPUESTA_MS) alCambiarRef.current(null);
      else reconectar();
    }
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      cerrado = true;
      clearTimeout(reintento);
      clearInterval(latido);
      document.removeEventListener("visibilitychange", alVolver);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, []);

  return conectado;
}
