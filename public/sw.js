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
    Promise.all([
      self.registration.showNotification(aviso.titulo || "Nuevo reporte en AulaViva", {
        body: aviso.cuerpo || "",
        tag: aviso.tag,
        // Con la misma etiqueta, vuelve a sonar y a mostrarse en vez de reemplazarse en silencio
        renotify: Boolean(aviso.tag),
        icon: "/icono-180.png?v=dragon3",
        badge: "/icono-180.png?v=dragon3",
        data: { url: aviso.url || "/dashboard" },
        // Un reporte urgente queda en pantalla hasta que TI lo toque
        requireInteraction: Boolean(aviso.urgente),
        vibrate: aviso.urgente ? [200, 100, 200, 100, 200] : [200],
      }),
      avisarAlPanel(aviso),
      marcarPendientes(aviso.pendientes),
    ]),
  );
});

// Si el panel está abierto en alguna pestaña, toca el sonido de AulaViva (ver src/sonido.ts).
// Solo en una pestaña, la que está al frente si la hay, para que no suene repetido
async function avisarAlPanel(aviso) {
  const abiertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const paneles = abiertas.filter((c) => new URL(c.url).origin === self.location.origin && !/^\/(r\/|docente)/.test(new URL(c.url).pathname));
  const panel = paneles.find((c) => c.focused) ?? paneles.find((c) => c.visibilityState === "visible") ?? paneles[0];
  panel?.postMessage({ tipo: "aviso", urgente: Boolean(aviso.urgente) });
}

// Número de reportes sin resolver en el ícono de la app instalada, como los mensajes sin leer de WhatsApp.
// Con el panel abierto lo mantiene al día src/usePendientes.ts
async function marcarPendientes(n) {
  if (typeof n !== "number" || !("setAppBadge" in self.navigator)) return;
  try {
    if (n > 0) await self.navigator.setAppBadge(n);
    else await self.navigator.clearAppBadge();
  } catch {
    // sin permiso para mostrar el número
  }
}

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

