-- Nuevos tipos de falla: audio, impresora y periféricos.
-- SQLite no deja cambiar un CHECK, así que se reconstruyen las tablas reporte y ficha.
-- De paso, el estado del reporte acepta 'escalado' (casos derivados a GLPI), para no
-- tener que reconstruir la tabla otra vez en el próximo cambio.
--
-- Cuidado: foto_reporte apunta a reporte con ON DELETE CASCADE. Si se borrara reporte
-- con las fotos enlazadas, se borrarían también. Por eso las fotos se guardan aparte
-- primero y se vuelven a cargar al final, con los mismos id.
PRAGMA defer_foreign_keys = true;

CREATE TABLE foto_reporte_copia AS SELECT id, reporte_id, r2_key, creado_en FROM foto_reporte;
DROP TABLE foto_reporte;

CREATE TABLE reporte_nuevo (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  aula_id               INTEGER NOT NULL REFERENCES aula(id),
  activo_id             INTEGER REFERENCES activo(id),     -- opcional: "no hay internet" no es un equipo
  profesor_id           INTEGER REFERENCES profesor(id),   -- reportes del docente por QR
  reportado_por_nombre  TEXT,
  tipo_falla            TEXT NOT NULL CHECK (tipo_falla IN ('internet', 'proyector', 'pc', 'otro', 'audio', 'impresora', 'perifericos')),
  bloquea_clase         INTEGER NOT NULL DEFAULT 0,
  descripcion           TEXT,
  origen                TEXT NOT NULL DEFAULT 'whatsapp' CHECK (origen IN ('whatsapp', 'qr')),
  estado                TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'en_atencion', 'resuelto', 'escalado')),
  reportado_en          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atendido_en           TEXT,
  resuelto_en           TEXT,
  notas_resolucion      TEXT,                              -- qué se hizo (base del asistente RAG)
  causa                 TEXT,                              -- qué se encontró
  entrada               TEXT                               -- por dónde llegó (ver 0007_entrada.sql)
);
INSERT INTO reporte_nuevo (id, aula_id, activo_id, profesor_id, reportado_por_nombre, tipo_falla, bloquea_clase, descripcion,
  origen, estado, reportado_en, atendido_en, resuelto_en, notas_resolucion, causa, entrada)
SELECT id, aula_id, activo_id, profesor_id, reportado_por_nombre, tipo_falla, bloquea_clase, descripcion,
  origen, estado, reportado_en, atendido_en, resuelto_en, notas_resolucion, causa, entrada
FROM reporte;
DROP TABLE reporte;
ALTER TABLE reporte_nuevo RENAME TO reporte;
CREATE INDEX idx_reporte_estado ON reporte(estado);
CREATE INDEX idx_reporte_aula ON reporte(aula_id, reportado_en);

CREATE TABLE foto_reporte (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporte_id INTEGER NOT NULL REFERENCES reporte(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO foto_reporte (id, reporte_id, r2_key, creado_en) SELECT id, reporte_id, r2_key, creado_en FROM foto_reporte_copia;
DROP TABLE foto_reporte_copia;
CREATE INDEX idx_foto_reporte ON foto_reporte (reporte_id);

CREATE TABLE ficha_nueva (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo_falla TEXT NOT NULL CHECK (tipo_falla IN ('internet', 'proyector', 'pc', 'otro', 'audio', 'impresora', 'perifericos')),
  titulo TEXT NOT NULL,
  sintomas TEXT,          -- cómo se ve la falla, en palabras del docente
  pasos_docente TEXT,     -- lo que el docente puede probar solo, un paso por línea
  cuando_llamar_ti TEXT,  -- cuándo dejar de intentar y avisar a TI
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO ficha_nueva (id, tipo_falla, titulo, sintomas, pasos_docente, cuando_llamar_ti, creado_en, actualizado_en)
SELECT id, tipo_falla, titulo, sintomas, pasos_docente, cuando_llamar_ti, creado_en, actualizado_en FROM ficha;
DROP TABLE ficha;
ALTER TABLE ficha_nueva RENAME TO ficha;
CREATE INDEX idx_ficha_tipo ON ficha (tipo_falla);
