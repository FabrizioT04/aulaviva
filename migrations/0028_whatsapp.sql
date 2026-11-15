-- Reportes que los docentes mandan al WhatsApp Business de la sede (WhatsApp Cloud API, ver docs/whatsapp.md).
-- El Worker recibe cada mensaje por un webhook, arma el reporte y responde dentro de las 24 h que da WhatsApp
-- desde el último mensaje del docente (en esa ventana las respuestas son gratis).

-- Cada número que escribió: su nombre de perfil, cuándo escribió por última vez (abre la ventana de 24 h)
-- y la última aula que reportó, para sugerirla si no la menciona.
CREATE TABLE wa_contacto (
  telefono          TEXT PRIMARY KEY,        -- como lo envía WhatsApp, ej. 51987654321
  nombre            TEXT,                    -- nombre de perfil de WhatsApp
  ultimo_mensaje_en TEXT NOT NULL,
  ultima_aula_id    INTEGER REFERENCES aula(id),
  fotos_sueltas     TEXT NOT NULL DEFAULT '[]' -- fotos enviadas sin texto, por si el reporte llega después (JSON)
);

-- Mensaje del docente que todavía no es un reporte: falta el aula o la falla.
-- Mientras espera, Hazio le pregunta. Si no responde, TI lo clasifica en la bandeja "Por clasificar" del dashboard.
CREATE TABLE wa_borrador (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  telefono      TEXT NOT NULL,
  nombre        TEXT,
  texto         TEXT,                        -- lo que escribió el docente
  aula_id       INTEGER REFERENCES aula(id),
  tipo_falla    TEXT,
  bloquea_clase INTEGER NOT NULL DEFAULT 0,
  fotos         TEXT NOT NULL DEFAULT '[]',  -- id de las fotos en WhatsApp (JSON), se bajan al crear el reporte
  paso          TEXT,                        -- qué se le preguntó: confirmar_aula, aula o falla
  intentos      INTEGER NOT NULL DEFAULT 0,  -- respuestas que no se entendieron
  estado        TEXT NOT NULL DEFAULT 'esperando' CHECK (estado IN ('esperando', 'registrado', 'descartado')),
  reporte_id    INTEGER REFERENCES reporte(id) ON DELETE SET NULL,
  recibido_en   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  cerrado_por   TEXT                         -- 'whatsapp' si se completó en la conversación, o el correo de TI
);
CREATE INDEX idx_wa_borrador ON wa_borrador (estado, telefono, actualizado_en);

-- Id de los mensajes ya procesados: WhatsApp a veces reenvía el mismo aviso
CREATE TABLE wa_mensaje (
  id          TEXT PRIMARY KEY,
  recibido_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Reporte que llegó por WhatsApp: a quién avisar cuando se resuelva.
-- wa_aviso: 'enviado' si ya se le dijo "Resuelto", 'pendiente' si pasaron las 24 h y se le dirá cuando vuelva a escribir.
ALTER TABLE reporte ADD COLUMN wa_telefono TEXT;
ALTER TABLE reporte ADD COLUMN wa_aviso TEXT;
CREATE INDEX idx_reporte_wa ON reporte (wa_telefono, wa_aviso);
