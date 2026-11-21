// Alerta fuerte en el celular de TI para los reportes urgentes ("No puedo continuar mi clase"), con la app ntfy
// (https://ntfy.sh, gratis en Android e iPhone). Va con prioridad máxima: suena y vibra largo, aparece encima de
// todo y en Android puede saltarse el "No molestar". Es aparte de las notificaciones del navegador.
//
// Secretos (ver README, "Alerta urgente con ntfy"):
//   NTFY_TEMA      nombre largo y secreto del canal; quien lo sepa puede leer las alertas
//   NTFY_SERVIDOR  opcional, por defecto https://ntfy.sh
//   NTFY_TOKEN     opcional, si el servidor pide usuario (token de acceso de ntfy)
//
// Solo viajan el aula, la sección y la falla: nunca nombres, correos ni el detalle que escribió el docente.
import type { Env } from "./index";

export interface AlertaNtfy {
  titulo: string; // ej. "Urgente · Aula 304 (9B)"
  mensaje: string; // ej. "Proyector · No puede continuar la clase"
  url: string; // ruta del panel que abre al tocar la alerta
}

export const ntfyConfigurado = (env: Env) => Boolean(env.NTFY_TEMA?.trim());

export async function alertarNtfy(env: Env, origen: string, alerta: AlertaNtfy): Promise<number | null> {
  const tema = env.NTFY_TEMA?.trim();
  if (!tema) return null;
  const servidor = (env.NTFY_SERVIDOR?.trim() || "https://ntfy.sh").replace(/\/+$/, "");
  // Se publica en JSON para que las tildes y la ñ lleguen bien (en cabeceras HTTP no se puede)
  const respuesta = await fetch(servidor, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.NTFY_TOKEN?.trim() ? { Authorization: `Bearer ${env.NTFY_TOKEN.trim()}` } : {}),
    },
    body: JSON.stringify({
      topic: tema,
      title: alerta.titulo,
      message: alerta.mensaje,
      priority: 5, // máxima
      tags: ["rotating_light"],
      click: new URL(alerta.url, origen).toString(),
    }),
  });
  // Solo metadatos: nunca registrar el tema, que es secreto
  console.log("ntfy: resultado", { estado: respuesta.status });
  return respuesta.status;
}
