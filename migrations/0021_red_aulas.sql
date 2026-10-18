-- Las aulas usan la red "aula_innova" (el Welcome Lobby y la Sala de docentes ya tienen la suya, ver 0020)
UPDATE aula SET red_wifi = 'aula_innova' WHERE red_wifi IS NULL;

-- Si una ficha nombra "aula_innova" a mano, pasa a {red} para que en el WL y la SD salga su propia red
UPDATE ficha SET pasos_docente = REPLACE(REPLACE(pasos_docente, 'la red "aula_innova"', '{red}'), 'la red aula_innova', '{red}')
WHERE pasos_docente LIKE '%aula_innova%';
