-- Hasta 3 fotos por reporte (Sprint 2). Cada foto se guarda en R2; aquí solo su clave.
CREATE TABLE foto_reporte (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporte_id INTEGER NOT NULL REFERENCES reporte(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_foto_reporte ON foto_reporte (reporte_id);

-- Pasa las fotos que ya existían (una por reporte) a la tabla nueva
INSERT INTO foto_reporte (reporte_id, r2_key)
SELECT id, foto_key FROM reporte WHERE foto_key IS NOT NULL;

ALTER TABLE reporte DROP COLUMN foto_key;
