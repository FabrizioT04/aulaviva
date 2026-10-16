-- Navegadores de TI que reciben una notificación push con cada reporte nuevo.
-- endpoint es la dirección del servicio push (Google, Mozilla, Apple) para ese navegador.
CREATE TABLE suscripcion_push (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
