// Solo cambia navegaciones: las API, notificaciones y recursos de instalaciones
// existentes siguen en su origen y no pierden cuerpos ni credenciales.
export function direccionHazio(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.hostname !== "aulaviva.smp1.workers.dev"
    || !["GET", "HEAD"].includes(request.method)
    || url.pathname.startsWith("/api/")
    || request.headers.get("Upgrade")
    || !(request.headers.get("Sec-Fetch-Mode") === "navigate"
      || request.headers.get("Accept")?.includes("text/html"))) return null;
  url.hostname = "hazio.smp1.workers.dev";
  return new Response(null, {
    status: 302,
    headers: { Location: url.href, "Cache-Control": "no-store" },
  });
}
