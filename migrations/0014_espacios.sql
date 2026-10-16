-- Espacios fuera de las aulas que atiende TI, y qué computadora hay en cada ambiente.
-- En las aulas se trabaja con laptops. En el Welcome Lobby y en la Sala de docentes hay
-- All in One (AIO), que los docentes llaman "computadora": en su QR la opción dice así.
ALTER TABLE aula ADD COLUMN equipo TEXT NOT NULL DEFAULT 'laptop' CHECK (equipo IN ('laptop', 'aio'));

INSERT INTO aula (codigo, nombre, piso, equipo)
SELECT 'WL', 'Welcome Lobby', 1, 'aio' WHERE NOT EXISTS (SELECT 1 FROM aula WHERE codigo = 'WL');

INSERT INTO aula (codigo, nombre, piso, equipo)
SELECT 'SD', 'Sala de docentes', 1, 'aio' WHERE NOT EXISTS (SELECT 1 FROM aula WHERE codigo = 'SD');
