// Service worker del panel de TI: solo muestra las notificaciones push de reportes nuevos.
// No guarda nada en caché ni intercepta peticiones.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let aviso = {};
  try {
    aviso = e.data ? e.data.json() : {};
  } catch {
    aviso = { cuerpo: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    self.registration.showNotification(aviso.titulo || "Nuevo reporte en AulaViva", {
      body: aviso.cuerpo || "",
      tag: aviso.tag,
      icon: "/icono-180.png",
      badge: "/icono-180.png",
      data: { url: aviso.url || "/dashboard" },
      // Un reporte urgente queda en pantalla hasta que TI lo toque
      requireInteraction: Boolean(aviso.urgente),
      vibrate: aviso.urgente ? [200, 100, 200, 100, 200] : [200],
    }),
  );
});

// Al tocar la notificación: abre el aula en el panel, reutilizando una pestaña abierta si la hay
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const destino = new URL(e.notification.data?.url || "/dashboard", self.location.origin).href;
  e.waitUntil(
    (async () => {
      const abiertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const panel = abiertas.find((c) => new URL(c.url).origin === self.location.origin && !/^\/(r\/|docente)/.test(new URL(c.url).pathname));
      if (panel) {
        await panel.focus();
        return panel.navigate(destino).catch(() => self.clients.openWindow(destino));
      }
      return self.clients.openWindow(destino);
    })(),
  );
});
