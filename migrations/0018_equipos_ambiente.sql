-- Qué fallas se pueden reportar en cada ambiente.
-- clases: en el Welcome Lobby y la Sala de docentes no se dictan clases, así que no hay proyector
-- y el botón urgente no habla de "mi clase".
-- impresora: solo el Welcome Lobby tiene impresora de red.
-- audio: la Sala de docentes no tiene parlantes.
ALTER TABLE aula ADD COLUMN clases INTEGER NOT NULL DEFAULT 1 CHECK (clases IN (0, 1));
ALTER TABLE aula ADD COLUMN impresora INTEGER NOT NULL DEFAULT 0 CHECK (impresora IN (0, 1));
ALTER TABLE aula ADD COLUMN audio INTEGER NOT NULL DEFAULT 1 CHECK (audio IN (0, 1));

UPDATE aula SET clases = 0 WHERE codigo IN ('WL', 'SD');
UPDATE aula SET impresora = 1 WHERE codigo = 'WL';
UPDATE aula SET audio = 0 WHERE codigo = 'SD';
