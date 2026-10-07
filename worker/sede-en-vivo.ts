import { DurableObject } from "cloudflare:workers";
import type { EventoEnVivo } from "../shared/tipos";
import type { Env } from "./index";

// Un Durable Object por sede: mantiene abiertos los WebSockets de los
// dashboards y les reenvía cada cambio de estado de un aula al instante.
export class SedeEnVivo extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Se esperaba un WebSocket", { status: 426 });
    }
    const { 0: cliente, 1: servidor } = new WebSocketPair();
    // API de hibernación: el objeto no cobra tiempo mientras no hay mensajes
    this.ctx.acceptWebSocket(servidor);
    return new Response(null, { status: 101, webSocket: cliente });
  }

  // Lo llama el Worker (RPC) después de guardar un cambio en D1
  async difundir(evento: EventoEnVivo): Promise<void> {
    const mensaje = JSON.stringify(evento);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(mensaje);
      } catch {
        // conexión cerrada; se limpia sola
      }
    }
  }

  async webSocketMessage(ws: WebSocket, mensaje: string | ArrayBuffer) {
    if (mensaje === "ping") ws.send("pong");
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    ws.close(code, reason);
  }
}
