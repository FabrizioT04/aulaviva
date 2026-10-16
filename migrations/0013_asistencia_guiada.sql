-- Asistencia guiada: al elegir la falla en el QR, el docente ve los pasos de la ficha
-- ("Lo que puede probar el docente") antes de avisar a TI.
-- Si con eso funciona, queda una autosolución y TI no recibe reporte.
-- Si igual avisa, el reporte guarda qué ficha vio, para que TI no repita esos pasos.
ALTER TABLE reporte ADD COLUMN ficha_vista_id INTEGER REFERENCES ficha(id) ON DELETE SET NULL;

CREATE TABLE autosolucion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  aula_id INTEGER NOT NULL REFERENCES aula(id),
  ficha_id INTEGER REFERENCES ficha(id) ON DELETE SET NULL,
  tipo_falla TEXT NOT NULL,
  email TEXT NOT NULL,
  en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_autosolucion_en ON autosolucion (en);
