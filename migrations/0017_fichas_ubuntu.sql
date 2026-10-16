-- Las laptops de la sede usan Ubuntu Desktop: los pasos del docente de las fichas iniciales
-- (seed/fichas-iniciales.sql) decían atajos de Windows. Solo cambia las fichas que siguen con el
-- texto original (sin contar saltos de línea de Windows), así que no pisa lo que TI ya haya editado.

UPDATE ficha SET pasos_docente = 'Abre el menú de arriba a la derecha (donde están la red, el volumen y la batería) y revisa que el Wi-Fi esté activado
En ese menú, entra en Wi-Fi y vuelve a conectarte a la red de docentes del colegio
Reinicia la laptop'
WHERE titulo = 'La laptop no tiene internet'
  AND REPLACE(pasos_docente, char(13), '') = 'Revisa que el WiFi de la laptop esté activado (ícono abajo a la derecha)
Desconéctate y vuelve a conectarte a la red de docentes del colegio
Reinicia la laptop';

UPDATE ficha SET pasos_docente = 'Recarga la página con Ctrl + Shift + R
Cierra el navegador por completo y vuelve a abrirlo
Prueba abrir la página en otro navegador (Firefox o Chrome)'
WHERE titulo = 'Una página no carga pero las demás sí'
  AND REPLACE(pasos_docente, char(13), '') = 'Recarga la página con Ctrl + F5
Cierra el navegador por completo y vuelve a abrirlo
Prueba abrir la página en otro navegador (Chrome o Edge)';

UPDATE ficha SET pasos_docente = 'Revisa que el cable HDMI esté bien conectado en la laptop y en la pared
En la laptop, presiona la tecla Super (la del logo, junto a Alt) + P hasta que la imagen salga en el proyector
En el control del proyector Epson, presiona Source Search y espera unos segundos (en ViewSonic, el botón Source)
Si el proyector está prendido pero la imagen sale en negro, presiona A/V Mute en el control o abre la tapa del lente'
WHERE titulo = 'El proyector dice "Sin señal"'
  AND REPLACE(pasos_docente, char(13), '') = 'Revisa que el cable HDMI esté bien conectado en la laptop y en la pared
En la laptop, presiona Windows + P y elige Duplicar
En el control del proyector Epson, presiona Source Search y espera unos segundos (en ViewSonic, el botón Source)
Si el proyector está prendido pero la imagen sale en negro, presiona A/V Mute en el control o abre la tapa del lente';

UPDATE ficha SET pasos_docente = 'Abre el menú de arriba a la derecha, revisa que no esté en silencio y sube el volumen
Abre Configuración > Sonido y en Salida elige los parlantes del aula (o HDMI si el sonido sale por el proyector)
Revisa que los parlantes estén prendidos y con el volumen arriba'
WHERE titulo = 'No se escucha el audio'
  AND REPLACE(pasos_docente, char(13), '') = 'Revisa que la laptop no esté en silencio y sube el volumen
Haz clic en el ícono de volumen y elige los parlantes del aula como salida
Revisa que los parlantes estén prendidos y con el volumen arriba';
