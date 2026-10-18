-- Nuevo tipo de falla: ecran (la pantalla de proyección de las aulas).
-- SQLite no deja cambiar un CHECK, así que se reconstruyen reporte y ficha. Esta vez la columna
-- tipo_falla queda sin CHECK: el Worker ya valida el tipo (shared/tipos.ts), y así el próximo tipo
-- nuevo no necesita reconstruir las tablas otra vez.
--
-- Cuidado: borrar una tabla dispara las acciones de sus claves foráneas. foto_reporte y reporte_evento
-- se borran en cascada con reporte, y reporte.ficha_vista_id y autosolucion.ficha_id quedan en NULL
-- si se borra ficha. Por eso todo se copia primero a tablas sin restricciones, se borran las tablas
-- de abajo hacia arriba y se vuelven a crear con los mismos id.
PRAGMA defer_foreign_keys = true;

CREATE TABLE foto_reporte_copia AS SELECT id, reporte_id, r2_key, creado_en FROM foto_reporte;
CREATE TABLE reporte_evento_copia AS SELECT id, reporte_id, estado, email, nota, en FROM reporte_evento;
CREATE TABLE autosolucion_copia AS SELECT id, aula_id, ficha_id, tipo_falla, email, en FROM autosolucion;
CREATE TABLE reporte_copia AS
  SELECT id, aula_id, activo_id, profesor_id, reportado_por_nombre, tipo_falla, bloquea_clase, descripcion, origen, estado,
    reportado_en, atendido_en, resuelto_en, notas_resolucion, causa, entrada, observaciones, ticket_glpi, escalado_en,
    registrado_por, ficha_vista_id
  FROM reporte;

DROP TABLE foto_reporte;
DROP TABLE reporte_evento;
DROP TABLE autosolucion;
DROP TABLE reporte;

-- Ya nadie apunta a ficha: se reconstruye sin que nada quede en NULL
CREATE TABLE ficha_nueva (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo_falla TEXT NOT NULL,
  titulo TEXT NOT NULL,
  sintomas TEXT,          -- cómo se ve la falla, en palabras del docente
  pasos_docente TEXT,     -- lo que el docente puede probar solo, un paso por línea
  cuando_llamar_ti TEXT,  -- cuándo dejar de intentar y avisar a TI
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  causas_posibles TEXT,
  pasos_ti TEXT
);
INSERT INTO ficha_nueva (id, tipo_falla, titulo, sintomas, pasos_docente, cuando_llamar_ti, creado_en, actualizado_en, causas_posibles, pasos_ti)
SELECT id, tipo_falla, titulo, sintomas, pasos_docente, cuando_llamar_ti, creado_en, actualizado_en, causas_posibles, pasos_ti FROM ficha;
DROP TABLE ficha;
ALTER TABLE ficha_nueva RENAME TO ficha;
CREATE INDEX idx_ficha_tipo ON ficha (tipo_falla);

CREATE TABLE reporte (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  aula_id               INTEGER NOT NULL REFERENCES aula(id),
  activo_id             INTEGER REFERENCES activo(id),     -- opcional: "no hay internet" no es un equipo
  profesor_id           INTEGER REFERENCES profesor(id),   -- reportes del docente por QR
  reportado_por_nombre  TEXT,
  tipo_falla            TEXT NOT NULL,                     -- ver TIPOS_FALLA en shared/tipos.ts
  bloquea_clase         INTEGER NOT NULL DEFAULT 0,
  descripcion           TEXT,
  origen                TEXT NOT NULL DEFAULT 'whatsapp' CHECK (origen IN ('whatsapp', 'qr')),
  estado                TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'en_atencion', 'resuelto', 'escalado')),
  reportado_en          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atendido_en           TEXT,
  resuelto_en           TEXT,
  notas_resolucion      TEXT,                              -- qué se hizo (base del asistente RAG)
  causa                 TEXT,                              -- qué se encontró
  entrada               TEXT,                              -- por dónde llegó (ver 0007_entrada.sql)
  observaciones         TEXT,
  ticket_glpi           TEXT,
  escalado_en           TEXT,
  registrado_por        TEXT,
  ficha_vista_id        INTEGER REFERENCES ficha(id) ON DELETE SET NULL
);
INSERT INTO reporte (id, aula_id, activo_id, profesor_id, reportado_por_nombre, tipo_falla, bloquea_clase, descripcion, origen, estado,
  reportado_en, atendido_en, resuelto_en, notas_resolucion, causa, entrada, observaciones, ticket_glpi, escalado_en, registrado_por, ficha_vista_id)
SELECT id, aula_id, activo_id, profesor_id, reportado_por_nombre, tipo_falla, bloquea_clase, descripcion, origen, estado,
  reportado_en, atendido_en, resuelto_en, notas_resolucion, causa, entrada, observaciones, ticket_glpi, escalado_en, registrado_por, ficha_vista_id
FROM reporte_copia;
CREATE INDEX idx_reporte_estado ON reporte(estado);
CREATE INDEX idx_reporte_aula ON reporte(aula_id, reportado_en);

CREATE TABLE foto_reporte (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporte_id INTEGER NOT NULL REFERENCES reporte(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO foto_reporte (id, reporte_id, r2_key, creado_en) SELECT id, reporte_id, r2_key, creado_en FROM foto_reporte_copia;
CREATE INDEX idx_foto_reporte ON foto_reporte (reporte_id);

CREATE TABLE reporte_evento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporte_id INTEGER NOT NULL REFERENCES reporte(id) ON DELETE CASCADE,
  estado TEXT NOT NULL,   -- abierto, en_atencion, escalado o resuelto
  email TEXT,             -- quién hizo el cambio (vacío en los reportes anteriores a 0011)
  nota TEXT,              -- ej. "GLPI #4521"
  en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO reporte_evento (id, reporte_id, estado, email, nota, en) SELECT id, reporte_id, estado, email, nota, en FROM reporte_evento_copia;
CREATE INDEX idx_evento_reporte ON reporte_evento (reporte_id, en);

CREATE TABLE autosolucion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  aula_id INTEGER NOT NULL REFERENCES aula(id),
  ficha_id INTEGER REFERENCES ficha(id) ON DELETE SET NULL,
  tipo_falla TEXT NOT NULL,
  email TEXT NOT NULL,
  en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO autosolucion (id, aula_id, ficha_id, tipo_falla, email, en) SELECT id, aula_id, ficha_id, tipo_falla, email, en FROM autosolucion_copia;
CREATE INDEX idx_autosolucion_en ON autosolucion (en);

DROP TABLE foto_reporte_copia;
DROP TABLE reporte_evento_copia;
DROP TABLE autosolucion_copia;
DROP TABLE reporte_copia;
