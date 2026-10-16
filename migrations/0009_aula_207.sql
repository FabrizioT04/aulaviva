-- El aula 207 es un MediaLab (ML), no "LBR" como figuraba en el cuadro de asignación.
UPDATE aula SET seccion = 'ML' WHERE codigo = '207' AND seccion = 'LBR';
