-- Daños y mantenimiento: aparte de las incidencias de TI (ver shared/danos.ts).
-- Chromebooks dañadas por estudiantes (las sigue COA) y desperfectos del local (Mantenimiento).
CREATE TABLE dano (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  aula_id         INTEGER NOT NULL REFERENCES aula(id),
  area            TEXT NOT NULL CHECK (area IN ('coa', 'mantenimiento')),
  tipo            TEXT NOT NULL,           -- clave de TIPOS_DANO
  equipo          TEXT,                    -- código o etiqueta de la Chromebook
  seccion         TEXT,                    -- sección del estudiante
  estudiante      TEXT,                    -- opcional
  descripcion     TEXT,
  estado          TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_proceso', 'resuelto')),
  reportado_por   TEXT NOT NULL,           -- correo de quien lo registró
  reportado_en    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resuelto_en     TEXT,
  nota_cierre     TEXT,                    -- qué se hizo
  actualizado_por TEXT
);
CREATE INDEX idx_dano_estado ON dano (area, estado, reportado_en);

CREATE TABLE foto_dano (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  dano_id   INTEGER NOT NULL REFERENCES dano(id) ON DELETE CASCADE,
  r2_key    TEXT NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_foto_dano ON foto_dano (dano_id);
