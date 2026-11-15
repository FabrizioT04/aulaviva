-- Eventos y actividades (ver shared/eventos.ts):
--  externo: actividades de instituciones externas o fuera del horario de clases que usan un aula o un patio
--           y para las que TI deja listo el equipo.
--  apoyo:   tareas de TI que no son una falla ni un daño (ej. subir hojas bond), con su hora de inicio y fin.
CREATE TABLE evento (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo            TEXT NOT NULL DEFAULT 'externo' CHECK (tipo IN ('externo', 'apoyo')),
  nombre          TEXT NOT NULL,           -- nombre del evento o qué se hizo
  organiza        TEXT,                    -- institución o persona externa que lo organiza
  aula_id         INTEGER REFERENCES aula(id), -- obligatorio en los externos, opcional en el apoyo
  inicio          TEXT NOT NULL,           -- ISO, en UTC
  fin             TEXT,                    -- ISO, en UTC
  responsable     TEXT,                    -- quién del colegio responde por el evento
  contacto        TEXT,                    -- teléfono o correo del organizador
  equipos         TEXT NOT NULL DEFAULT '[]', -- JSON con las claves de EQUIPOS_EVENTO
  notas           TEXT,
  estado          TEXT NOT NULL DEFAULT 'programado' CHECK (estado IN ('programado', 'realizado', 'cancelado')),
  nota_cierre     TEXT,                    -- cómo fue o por qué se canceló
  registrado_por  TEXT NOT NULL,
  registrado_en   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actualizado_por TEXT
);
CREATE INDEX idx_evento_inicio ON evento (estado, inicio);
