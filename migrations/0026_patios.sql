-- Patios: espacios abiertos donde se arma el equipo de sonido (formaciones, actuaciones, eventos).
-- No tienen computadora, proyector, impresora ni internet propio: en su QR y en Registrar solo se puede
-- reportar el equipo de sonido u "Otro" (ver fallasDe en shared/tipos.ts).
ALTER TABLE aula ADD COLUMN espacio TEXT NOT NULL DEFAULT 'aula' CHECK (espacio IN ('aula', 'patio'));

INSERT INTO aula (codigo, nombre, piso, clases, impresora, audio, espacio)
SELECT 'PATIO', 'Patio principal', 1, 0, 0, 1, 'patio' WHERE NOT EXISTS (SELECT 1 FROM aula WHERE codigo = 'PATIO');
