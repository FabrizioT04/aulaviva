-- Sprint 3: fichas de solución que escribe TI para las fallas más comunes.
-- Son la base del asistente desde el primer día, aunque todavía haya pocos casos resueltos.
CREATE TABLE ficha (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo_falla TEXT NOT NULL CHECK (tipo_falla IN ('internet', 'proyector', 'pc', 'otro')),
  titulo TEXT NOT NULL,
  sintomas TEXT,          -- cómo se ve la falla, en palabras del docente
  pasos_docente TEXT,     -- lo que el docente puede probar solo, un paso por línea
  cuando_llamar_ti TEXT,  -- cuándo dejar de intentar y avisar a TI
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_ficha_tipo ON ficha (tipo_falla);
