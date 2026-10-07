-- Modelo de datos: Aula, Activo, Profesor, Reporte

CREATE TABLE aula (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo      TEXT NOT NULL UNIQUE,          -- ej. "204", se usará en el QR del Sprint 2
  nombre      TEXT NOT NULL,                 -- ej. "Aula 204"
  piso        INTEGER,
  activa      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE activo (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  aula_id             INTEGER NOT NULL REFERENCES aula(id),
  tipo                TEXT NOT NULL CHECK (tipo IN ('proyector', 'pc', 'router', 'otro')),
  descripcion         TEXT,
  codigo_patrimonial  TEXT
);

-- Se llenará con el login de Google (Sprint 2); se deja lista desde ahora.
CREATE TABLE profesor (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre  TEXT NOT NULL,
  email   TEXT NOT NULL UNIQUE,              -- debe terminar en @innovaschools.edu.pe
  activo  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE reporte (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  aula_id               INTEGER NOT NULL REFERENCES aula(id),
  activo_id             INTEGER REFERENCES activo(id),     -- opcional: "no hay internet" no es un equipo
  profesor_id           INTEGER REFERENCES profesor(id),   -- Sprint 2 (QR + login)
  reportado_por_nombre  TEXT,                              -- Sprint 1: lo escribe TI desde el WhatsApp
  tipo_falla            TEXT NOT NULL CHECK (tipo_falla IN ('internet', 'proyector', 'pc', 'otro')),
  bloquea_clase         INTEGER NOT NULL DEFAULT 0,
  descripcion           TEXT,
  origen                TEXT NOT NULL DEFAULT 'whatsapp' CHECK (origen IN ('whatsapp', 'qr')),
  estado                TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'en_atencion', 'resuelto')),
  reportado_en          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atendido_en           TEXT,
  resuelto_en           TEXT,
  notas_resolucion      TEXT                               -- base de conocimiento del RAG (Sprint 3)
);

CREATE INDEX idx_reporte_estado ON reporte(estado);
CREATE INDEX idx_reporte_aula ON reporte(aula_id, reportado_en);
