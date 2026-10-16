-- Atención técnica: escalado a GLPI, observaciones de TI, quién registró y el historial de cambios.
-- (El estado 'escalado' ya lo acepta la tabla desde 0010_tipos_falla.sql.)
ALTER TABLE reporte ADD COLUMN observaciones TEXT;   -- verificaciones, avances o lo que queda pendiente
ALTER TABLE reporte ADD COLUMN ticket_glpi TEXT;     -- número del ticket cuando se escala
ALTER TABLE reporte ADD COLUMN escalado_en TEXT;
ALTER TABLE reporte ADD COLUMN registrado_por TEXT;  -- correo de quien lo registró (TI o el docente por QR)

-- Cada cambio de estado de un reporte, con quién y cuándo, para no perder la trazabilidad
CREATE TABLE reporte_evento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporte_id INTEGER NOT NULL REFERENCES reporte(id) ON DELETE CASCADE,
  estado TEXT NOT NULL,   -- abierto, en_atencion, escalado o resuelto
  email TEXT,             -- quién hizo el cambio (vacío en los reportes anteriores a esta migración)
  nota TEXT,              -- ej. "GLPI #4521"
  en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_evento_reporte ON reporte_evento (reporte_id, en);

-- Los reportes que ya existían: su historial se arma con las horas que ya estaban guardadas
UPDATE reporte SET registrado_por = reportado_por_nombre WHERE origen = 'qr';
INSERT INTO reporte_evento (reporte_id, estado, email, en)
  SELECT id, 'abierto', CASE WHEN origen = 'qr' THEN reportado_por_nombre END, reportado_en FROM reporte;
INSERT INTO reporte_evento (reporte_id, estado, en)
  SELECT id, 'en_atencion', atendido_en FROM reporte WHERE atendido_en IS NOT NULL;
INSERT INTO reporte_evento (reporte_id, estado, en)
  SELECT id, 'resuelto', resuelto_en FROM reporte WHERE resuelto_en IS NOT NULL;
