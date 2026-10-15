-- Pabellón, nivel y sección (grado) de cada aula de la sede SMP1, según el cuadro de asignación 2026.
-- La sección es la que conocen los docentes ("4A"), así el registro y el QR también la muestran.
ALTER TABLE aula ADD COLUMN pabellon TEXT;
ALTER TABLE aula ADD COLUMN nivel TEXT;
ALTER TABLE aula ADD COLUMN seccion TEXT;

UPDATE aula SET pabellon = 'A', nivel = 'Primaria', seccion = '2A' WHERE codigo = '104';
UPDATE aula SET pabellon = 'A', nivel = 'Primaria', seccion = '1B' WHERE codigo = '105';
UPDATE aula SET pabellon = 'A', nivel = 'Primaria', seccion = '1A' WHERE codigo = '106';
UPDATE aula SET pabellon = 'B', nivel = 'Inicial', seccion = 'KB' WHERE codigo = '108';
UPDATE aula SET pabellon = 'B', nivel = 'Inicial', seccion = 'KA' WHERE codigo = '109';
UPDATE aula SET pabellon = 'C', nivel = 'Inicial', seccion = 'PKB' WHERE codigo = '110';
UPDATE aula SET pabellon = 'C', nivel = 'Inicial', seccion = 'PKA' WHERE codigo = '111';
UPDATE aula SET pabellon = 'C', nivel = 'Inicial', seccion = 'BA' WHERE codigo = '112';
UPDATE aula SET pabellon = 'A', nivel = 'Primaria', seccion = '2B' WHERE codigo = '202';
UPDATE aula SET pabellon = 'A', nivel = 'Primaria', seccion = '3A' WHERE codigo = '203';
UPDATE aula SET pabellon = 'A', nivel = 'Primaria', seccion = '3B' WHERE codigo = '204';
UPDATE aula SET pabellon = 'A', nivel = 'Primaria', seccion = '4A' WHERE codigo = '205';
UPDATE aula SET pabellon = 'B', nivel = 'Varios', seccion = 'ML' WHERE codigo = '206';
UPDATE aula SET pabellon = 'B', nivel = 'Varios', seccion = 'LBR' WHERE codigo = '207';
UPDATE aula SET pabellon = 'B', nivel = 'Primaria', seccion = '4B' WHERE codigo = '208';
UPDATE aula SET pabellon = 'B', nivel = 'Primaria', seccion = '5A' WHERE codigo = '209';
UPDATE aula SET pabellon = 'C', nivel = 'Primaria', seccion = '5B' WHERE codigo = '210';
UPDATE aula SET pabellon = 'C', nivel = 'Primaria', seccion = '6A' WHERE codigo = '211';
UPDATE aula SET pabellon = 'C', nivel = 'Primaria', seccion = '6B' WHERE codigo = '212';
UPDATE aula SET pabellon = 'A', nivel = 'Secundaria', seccion = '11B' WHERE codigo = '301';
UPDATE aula SET pabellon = 'A', nivel = 'Secundaria', seccion = '11A' WHERE codigo = '302';
UPDATE aula SET pabellon = 'A', nivel = 'Secundaria', seccion = '9C' WHERE codigo = '303';
UPDATE aula SET pabellon = 'A', nivel = 'Secundaria', seccion = '9B' WHERE codigo = '304';
UPDATE aula SET pabellon = 'A', nivel = 'Secundaria', seccion = '9A' WHERE codigo = '305';
UPDATE aula SET pabellon = 'B', nivel = 'Rotaciones', seccion = 'ML/10B' WHERE codigo = '306';
UPDATE aula SET pabellon = 'B', nivel = 'Rotaciones', seccion = 'ML/10A' WHERE codigo = '307';
UPDATE aula SET pabellon = 'B', nivel = 'Varios', seccion = 'LC' WHERE codigo = '308';
UPDATE aula SET pabellon = 'B', nivel = 'Secundaria', seccion = '8B' WHERE codigo = '309';
UPDATE aula SET pabellon = 'C', nivel = 'Secundaria', seccion = '8A' WHERE codigo = '310';
UPDATE aula SET pabellon = 'C', nivel = 'Secundaria', seccion = '7B' WHERE codigo = '311';
UPDATE aula SET pabellon = 'C', nivel = 'Secundaria', seccion = '7A' WHERE codigo = '312';
