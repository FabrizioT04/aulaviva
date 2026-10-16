-- Daños y mantenimiento: aparte de las incidencias de TI (ver shared/danos.ts).
-- Equipos tecnológicos dañados (Chromebooks, laptops, proyectores) y desperfectos del local.
-- Todo lo atiende COA / Mantenimiento; los equipos tecnológicos también los ve TI.
CREATE TABLE dano (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  aula_id         INTEGER NOT NULL REFERENCES aula(id),
  grupo           TEXT NOT NULL CHECK (grupo IN ('tecnologia', 'local')),
  tipo            TEXT NOT NULL,           -- clave de TIPOS_DANO
  equipo          TEXT,                    -- código o etiqueta del equipo
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
CREATE INDEX idx_dano_estado ON dano (grupo, estado, reportado_en);

CREATE TABLE foto_dano (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  dano_id   INTEGER NOT NULL REFERENCES dano(id) ON DELETE CASCADE,
  r2_key    TEXT NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_foto_dano ON foto_dano (dano_id);
