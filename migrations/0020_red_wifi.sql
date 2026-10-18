-- Red Wi-Fi de cada ambiente. En las aulas es la red de docentes del colegio (vacío);
-- el Welcome Lobby y la Sala de docentes tienen la suya.
ALTER TABLE aula ADD COLUMN red_wifi TEXT;

UPDATE aula SET red_wifi = 'administracion_innova' WHERE codigo = 'WL';
UPDATE aula SET red_wifi = 'sala de docentes' WHERE codigo = 'SD';

-- En los pasos para el docente, {red} se reemplaza por la red del ambiente donde está el QR
UPDATE ficha SET pasos_docente = REPLACE(pasos_docente, 'la red de docentes del colegio', '{red}')
WHERE pasos_docente LIKE '%la red de docentes del colegio%';
