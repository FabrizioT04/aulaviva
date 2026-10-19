-- Atenciones de cuentas y plataformas: cambios de clave de los correos institucionales y soporte en las
-- plataformas educativas (Classroom, Pearson, Khan Academy, Elesapiens, ALEKS…). No guarda claves.
CREATE TABLE atencion_cuenta (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  accion      TEXT NOT NULL,                -- clave de ACCIONES_CUENTA en shared/cuentas.ts (la valida el Worker)
  plataforma  TEXT NOT NULL,                -- clave de PLATAFORMAS
  persona     TEXT NOT NULL,                -- estudiante, docente o directivo
  cantidad    INTEGER NOT NULL DEFAULT 1 CHECK (cantidad BETWEEN 1 AND 200), -- p. ej. las claves de toda una sección
  detalle     TEXT,                         -- opcional: la sección o un nombre corto
  nota        TEXT,
  origen      TEXT NOT NULL DEFAULT 'presencial' CHECK (origen IN ('whatsapp', 'presencial', 'otro')),
  email       TEXT NOT NULL,                -- quién de TI lo atendió
  creado_en   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_atencion_cuenta_creado ON atencion_cuenta (creado_en);
