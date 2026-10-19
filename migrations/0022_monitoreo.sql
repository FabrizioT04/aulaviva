-- Rondas de TI en los laboratorios ML (aulas con Chromebooks): cuándo empezó y terminó, y qué encontró
CREATE TABLE monitoreo (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  aula_id    INTEGER NOT NULL REFERENCES aula(id),
  email      TEXT NOT NULL,                -- quién hizo la ronda
  inicio     TEXT NOT NULL,                -- ISO UTC
  fin        TEXT,                         -- NULL mientras la ronda sigue
  hallazgos  TEXT NOT NULL DEFAULT '[]',   -- JSON con las claves de shared/monitoreo.ts; [] = todo en orden
  nota       TEXT
);
CREATE INDEX idx_monitoreo_email_inicio ON monitoreo(email, inicio);

-- Fotos de la ronda: se piden al menos una por piso en la mañana y otra en la tarde
CREATE TABLE foto_monitoreo (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  monitoreo_id  INTEGER NOT NULL REFERENCES monitoreo(id) ON DELETE CASCADE,
  r2_key        TEXT NOT NULL,
  creado_en     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_foto_monitoreo ON foto_monitoreo (monitoreo_id);
