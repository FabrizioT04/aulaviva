-- Fichas iniciales para la asistencia guiada del QR (borrador para que TI las revise).
-- Solo pasos seguros para el docente: nada de abrir equipos, tocar la instalación eléctrica
-- ni cambiar configuraciones de red. Si ya existe una ficha con el mismo título, no se duplica.
-- Se pueden editar después en Base de conocimiento.
-- Equipos de la sede: laptops Lenovo K14; proyectores Epson PowerLite X49 o X119 (algunos ViewSonic).

INSERT INTO ficha (tipo_falla, titulo, sintomas, causas_posibles, pasos_docente, pasos_ti, cuando_llamar_ti)
SELECT 'internet',
    'La laptop no tiene internet',
    'No carga ninguna página o sale "Sin conexión"',
    'WiFi apagado en la laptop, conectada a otra red, router del aula sin energía',
    'Revisa que el WiFi de la laptop esté activado (ícono abajo a la derecha)
Desconéctate y vuelve a conectarte a la red de docentes del colegio
Reinicia la laptop',
    'Revisar el router o access point del aula
Verificar en la consola si el equipo tiene IP asignada
Probar con otro equipo en la misma aula',
    'Si después de reiniciar sigue sin conectarse, o si a otras laptops del aula también les pasa'
WHERE NOT EXISTS (SELECT 1 FROM ficha WHERE titulo = 'La laptop no tiene internet');

INSERT INTO ficha (tipo_falla, titulo, sintomas, causas_posibles, pasos_docente, pasos_ti, cuando_llamar_ti)
SELECT 'internet', 'Una página no carga pero las demás sí',
    'Solo una página o plataforma no abre',
    'La página está caída, el navegador guardó una versión antigua',
    'Recarga la página con Ctrl + F5
Cierra el navegador por completo y vuelve a abrirlo
Prueba abrir la página en otro navegador (Chrome o Edge)',
    'Revisar si la página está bloqueada por el filtro de contenido
Limpiar caché y cookies del navegador',
    'Si la página sigue sin abrir en ningún navegador'
WHERE NOT EXISTS (SELECT 1 FROM ficha WHERE titulo = 'Una página no carga pero las demás sí');

INSERT INTO ficha (tipo_falla, titulo, sintomas, causas_posibles, pasos_docente, pasos_ti, cuando_llamar_ti)
SELECT 'proyector', 'El proyector dice "Sin señal"',
    'El proyector prende pero no muestra la pantalla de la laptop',
    'Cable HDMI suelto, entrada equivocada en el proyector, la laptop no está duplicando pantalla',
    'Revisa que el cable HDMI esté bien conectado en la laptop y en la pared
En la laptop, presiona Windows + P y elige Duplicar
En el control del proyector Epson, presiona Source Search y espera unos segundos (en ViewSonic, el botón Source)
Si el proyector está prendido pero la imagen sale en negro, presiona A/V Mute en el control o abre la tapa del lente',
    'Revisar el cable HDMI detrás del proyector
Probar con otro cable o con otra laptop
Revisar la configuración de entrada del proyector',
    'Si después de estos pasos sigue sin señal, o si el cable se ve dañado'
WHERE NOT EXISTS (SELECT 1 FROM ficha WHERE titulo = 'El proyector dice "Sin señal"');

INSERT INTO ficha (tipo_falla, titulo, sintomas, causas_posibles, pasos_docente, pasos_ti, cuando_llamar_ti)
SELECT 'proyector', 'El proyector no prende',
    'El proyector no enciende con el control ni con el botón',
    'Control sin pilas, proyector en enfriamiento, sin energía',
    'Apunta el control al proyector y presiona el botón de encendido una sola vez (en Epson se presiona dos veces para apagar, una para prender)
Si acabas de apagarlo, espera 2 minutos: necesita enfriarse antes de volver a prender
Prueba con el botón de encendido del propio proyector',
    'Revisar la toma de corriente y el cable de poder
Revisar la luz de estado del proyector
Revisar horas de uso de la lámpara',
    'Si la luz del proyector parpadea en rojo o naranja, o si no prende después de esperar'
WHERE NOT EXISTS (SELECT 1 FROM ficha WHERE titulo = 'El proyector no prende');

INSERT INTO ficha (tipo_falla, titulo, sintomas, causas_posibles, pasos_docente, pasos_ti, cuando_llamar_ti)
SELECT 'pc', 'La laptop o computadora no prende',
    'No enciende al presionar el botón',
    'Batería descargada, cargador desconectado, estabilizador apagado',
    'Revisa que el cargador esté conectado a la laptop y al tomacorriente
Revisa que el estabilizador esté prendido (luz encendida)
Mantén presionado el botón de encendido 3 segundos',
    'Revisar el cargador y la batería
Probar con otro cargador
Revisar el estabilizador y la toma',
    'Si no enciende con el cargador conectado, o si huele a quemado (no la vuelvas a prender)'
WHERE NOT EXISTS (SELECT 1 FROM ficha WHERE titulo = 'La laptop o computadora no prende');

INSERT INTO ficha (tipo_falla, titulo, sintomas, causas_posibles, pasos_docente, pasos_ti, cuando_llamar_ti)
SELECT 'audio', 'No se escucha el audio',
    'El video o la presentación no tiene sonido',
    'Volumen en silencio, salida de audio equivocada, parlantes apagados',
    'Revisa que la laptop no esté en silencio y sube el volumen
Haz clic en el ícono de volumen y elige los parlantes del aula como salida
Revisa que los parlantes estén prendidos y con el volumen arriba',
    'Revisar el cable de audio o la conexión Bluetooth
Revisar el driver de audio
Probar los parlantes con otro equipo',
    'Si después de elegir la salida correcta sigue sin sonido'
WHERE NOT EXISTS (SELECT 1 FROM ficha WHERE titulo = 'No se escucha el audio');

INSERT INTO ficha (tipo_falla, titulo, sintomas, causas_posibles, pasos_docente, pasos_ti, cuando_llamar_ti)
SELECT 'perifericos', 'El mouse o el teclado no responden',
    'El mouse no mueve el puntero o el teclado no escribe',
    'Cable o receptor USB suelto, pilas agotadas en los inalámbricos',
    'Desconecta y vuelve a conectar el mouse o el teclado en otro puerto USB
Si es inalámbrico, revisa que esté encendido y cambia las pilas si tienes a mano
Reinicia la laptop',
    'Probar el periférico en otro equipo
Cambiar el periférico si está dañado',
    'Si no responde en ningún puerto USB'
WHERE NOT EXISTS (SELECT 1 FROM ficha WHERE titulo = 'El mouse o el teclado no responden');
