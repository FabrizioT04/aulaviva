import { DurableObject } from "cloudflare:workers";
import type { EventoEnVivo } from "../shared/tipos";
import type { Env } from "./index";

// Un Durable Object por sede: mantiene abiertos los WebSockets del panel y les
// reenvía al instante cada cambio de estado de un aula y cada daño nuevo o actualizado.
export class SedeEnVivo extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // El panel manda "ping" cada tanto para que la conexión no se corte por inactividad.
    // Cloudflare responde "pong" sin despertar al objeto.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Se esperaba un WebSocket", { status: 426 });
    }
    const { 0: cliente, 1: servidor } = new WebSocketPair();
    // API de hibernación: el objeto no cobra tiempo mientras no hay mensajes
    this.ctx.acceptWebSocket(servidor);
    servidor.serializeAttachment({ abierto: Date.now() } satisfies Adjunto);
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + REVISAR_MS);
    return new Response(null, { status: 101, webSocket: cliente });
  }

  // El permiso se revisa solo al conectar. Para que quien sale de TI o de COA (o pierde la sesión) deje
  // de recibir avisos, cada conexión se cierra pasado un tiempo; el panel se reconecta solo y el Worker
  // vuelve a verificar la sesión
  async alarm() {
    const limite = Date.now() - VIGENCIA_MS;
    const abiertos = this.ctx.getWebSockets();
    for (const ws of abiertos) {
      const adjunto = ws.deserializeAttachment() as Adjunto | null;
      if ((adjunto?.abierto ?? 0) < limite) {
        try {
          ws.close(4000, "Vuelve a conectarte");
        } catch {
          // ya estaba cerrada
        }
      }
    }
    if (this.ctx.getWebSockets().length) await this.ctx.storage.setAlarm(Date.now() + REVISAR_MS);
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

interface Adjunto {
  abierto: number;
}
const VIGENCIA_MS = 30 * 60_000;
const REVISAR_MS = 5 * 60_000;

// Una sola sede por ahora
const SEDE = "smp1";

export function sede(env: Env) {
  return env.SEDE_EN_VIVO.get(env.SEDE_EN_VIVO.idFromName(SEDE));
}
