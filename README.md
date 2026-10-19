# AulaViva

Plataforma para registrar incidencias tecnológicas de las aulas y ver su estado en vivo.
Stack: React (Vite) + Cloudflare Workers + D1 + Durable Objects + R2, todo en un solo Worker.

## Qué incluye

### Sprint 1 · Panel de TI

- **Registro rápido** (`/`): aula, por dónde llegó (WhatsApp, en persona u otro canal), tipo de falla, si bloquea la clase, docente, detalle y la fecha y hora real del reporte. Si TI ya lo atendió, se registra resuelto de una vez con la hora de llegada, la hora de solución, la causa y qué se hizo. Al elegir el aula y la falla avisa si ya hay un reporte abierto igual y muestra cómo se resolvió antes, con un botón para reusar esa solución.
- **Atención técnica** (en Registrar): el caso se registra como Pendiente, En atención, Resuelto o Escalado. Al escalar se anota el ticket de GLPI, el diagnóstico y lo que queda pendiente; desde el dashboard también se puede "Escalar" un reporte abierto. Cada cambio de estado queda guardado con quién y cuándo, y se ve en "Historial de cambios" dentro del detalle del aula.
- **Tipos de falla**: Internet, Proyector, PC y Otro a la vista; Ecran (la pantalla de proyección), Audio, Impresora y Periféricos al tocar "Ver más" (en el panel y en la página del QR). Cada ambiente muestra solo los que tiene (ver Espacios con computadora). Si el detalle habla de otra falla que la elegida ("No agarra el internet" con PC), se sugiere cambiarla con un toque, sin obligar.
- **Borrador automático**: lo que se va llenando en Registrar y en la página del QR (la falla para TI y el aviso de daño) se guarda en ese navegador. Si quedó un aviso de daño a medio llenar, el QR abre directo ese formulario. Si alguien sale sin querer, al volver lo recupera con un aviso y la opción de empezar de nuevo. Se borra al enviar y, si no se envía, dura como máximo 1 hora. Las fotos y el nombre del estudiante no se guardan, y cada borrador es de quien lo escribió: si otra persona entra en el mismo navegador, no lo ve. Los vencidos se borran solos al abrir el QR o Registrar.
- **Dashboard en vivo** (`/dashboard`): semáforo por aula (verde, amarillo, rojo) y lista de reportes abiertos ordenada por urgencia. Se actualiza sola por WebSocket, con un latido cada 25 s para que la conexión no se corte, y se pone al día al reconectar o al volver a la pestaña. Daños, Observatorio y el detalle de un aula también se actualizan solos. Toca un aula para ver su detalle. Si se corta la conexión, avisa desde qué hora son los datos. Al resolver un reporte muestra casos ya resueltos que se parecen de verdad: comparten síntomas con el detalle (no solo la categoría), ordenados por relevancia, con "Muy parecido" o "Parecido" y en qué coinciden. Respeta el "no" ("la laptop enciende" no se parece a "la laptop no enciende"), entiende formas distintas de decir lo mismo ("no prende", "sin conexión") y da media coincidencia a síntomas relacionados ("sin alimentación eléctrica"). La relevancia pesa síntomas 45, causa 20 y aula 10; si el reporte todavía no tiene causa, se reparte entre síntomas y aula. No es IA: son reglas. También muestra las fichas de esa falla y un botón para usar esa solución. Si el reporte no tiene detalle, muestra los últimos de la misma falla y lo avisa.
- **Detalle de aula** (`/aula/:id`): historial completo, tiempos promedio y cómo se resolvió cada caso.
- **Observatorio** (`/observatorio`): incidencias, bloqueos y tiempos promedio de atención y resolución; incidencias por tipo de falla, por dónde llegan los reportes (QR impreso, escáner o lista de /docente, WhatsApp) las 5 aulas con más incidencias, la tendencia por día (o por semana en 90 días), cómo quedaron (pendientes, escaladas, resueltas) y las fallas que se repiten en la misma aula, con sus causas para distinguir si es el mismo desperfecto que vuelve o problemas distintos (7, 30 o 90 días).
- **Historial** (`/historial`): todas las fallas y daños que llegaron, mes por mes (o todo junto). Arriba, el resumen del Observatorio de ese mes (incidencias, bloqueos, escaladas, tiempos promedio y daños); abajo, la tabla completa con fecha, aula, falla, quién reportó y por dónde, estado, tiempos de atención y resolución, y causa y solución. Se puede buscar por aula, docente o causa, y "Descargar Excel" baja lo que se ve como CSV (fechas en hora de Lima, `AAAA-MM-DD HH:MM`). Al tocar una falla se abre su aula. Solo en la computadora.
- **Monitoreo ML** (`/monitoreo`): las rondas de TI en los laboratorios con Chromebooks (las aulas con "ML" en la sección, como 206, 207, 306 y 307). Al llegar al aula se toca "Empezar monitoreo"; mientras dura se marca lo que se encuentra (juegos o páginas no permitidas, Chromebook maltratada, sin carga, fuera de su lugar u otro) con una nota, y se guarda solo. "Pasar a Aula 207" cierra la ronda y abre la siguiente, para cuando se cambia de piso. Si se olvidó terminarla, después de dos horas pregunta a qué hora terminó. Abajo, las rondas de hoy y de la semana, las anteriores y su descarga en Excel. Es una tarea personal: solo la ven los correos del secreto `MONITOREO_EMAILS` (sin él, todo TI), y cada quien ve solo sus rondas. En el Historial, quien hace las rondas y COA (solo para mirar) ven además "Monitoreo": las rondas de cada mes con su horario, duración, quién y qué se encontró, el total de horas en el resumen y la descarga en Excel.
- **Notificaciones push** (botón de la campana): TI recibe un aviso en la PC o el celular con cada reporte de un docente, aunque el panel esté cerrado. Los urgentes quedan en pantalla hasta tocarlos, y al tocar el aviso se abre el aula. Con los avisos activos, la campana abre un menú para enviar una prueba solo a ese equipo (sirve para revisar una laptop o PC que no los muestra), elegir el tono de AulaViva (Campanita, Timbre, Marimba, Burbuja, Cristal, Alerta o sin sonido) o desactivarlos. El tono suena dos veces si el reporte es urgente, y suena cuando el panel está abierto en alguna pestaña, aunque esté minimizado; con el navegador cerrado se usa el sonido del sistema, porque los navegadores no dejan elegir el sonido de una notificación push. En iPhone, primero hay que agregar el panel a la pantalla de inicio. Las claves se generan una vez con `npm run push:claves`.
- **Casos sin resolver**: como los mensajes sin leer de WhatsApp, el menú muestra junto a "Dashboard" cuántos reportes siguen sin resolver (abiertos, en atención o escalados) y junto a "Daños y mantenimiento" cuántos daños están pendientes o en proceso, contando solo el grupo que atiende cada uno (TI, los equipos tecnológicos; COA, el local). Dentro de la pestaña, cada filtro de grupo muestra los suyos. La suma sale en el título y el ícono de la pestaña y, con el panel instalado como app en Windows o Mac, en su ícono de la barra de tareas. Todo se actualiza en vivo, y el de la barra de tareas también con cada notificación push aunque el panel esté cerrado. COA solo ve el de daños.
- **Atender y resolver**: guarda `atendido_en` y `resuelto_en` (tus métricas de tiempo) y pide las notas de resolución, que serán la base del asistente RAG del Sprint 3.

### Sprint 2 · Autorreporte por QR
- **Página del QR** (`/r/<aula>`): el docente escanea, elige la falla y toca "Avisar a TI" o, si la clase no puede seguir, "No puedo continuar mi clase" (urgente). El detalle y las fotos son opcionales y van plegados; en "Otro" el detalle es obligatorio. TI lo ve al instante en el dashboard. Es una página aparte sin React (unos 3 KB) para que cargue rápido en el celular. Muestra lo ya reportado para evitar duplicados y, si es urgente, el tiempo promedio de atención.
- **Espacios con computadora**: además de las aulas, el Welcome Lobby (WL) y la Sala de docentes (SD) tienen su QR. En las aulas la falla de equipo se llama "Laptop"; donde hay All in One se llama "Computadora", como la llaman los docentes. En el panel de TI es "Laptop / Computadora". Cada ambiente ofrece solo las fallas que puede tener: en el WL y la SD no se dictan clases, así que no aparecen Proyector ni Ecran y el botón urgente dice "No puedo seguir trabajando"; Impresora solo aparece en el WL, que tiene la impresora de red, y Audio no aparece en el WL ni en la SD, que no tienen parlantes (columnas `clases`, `impresora` y `audio` de `aula`). También tienen su propia red Wi-Fi ("administracion_innova" en el WL, "sala de docentes" en la SD): en los pasos de una ficha, `{red}` se reemplaza en el QR por la red de ese ambiente ("aula_innova" en las aulas), y donde hay All in One "laptop" se lee "computadora".
- **Daños y mantenimiento** (`/danos`): aparte de las incidencias de TI, sin tocar el semáforo ni las métricas. Hay dos grupos: equipos tecnológicos (Chromebooks golpeadas, con el cintillo de seguridad roto o manchadas, laptops, proyectores), con el código del equipo, la sección y, si se sabe, el nombre del estudiante; y desperfectos del local (ventilador, pared, mobiliario, puerta, luz, tomacorriente). Los docentes los reportan con fotos desde el QR ("¿Algo roto o golpeado?") y también se registran desde el panel. Para que no se confunda con una falla, cada pantalla del QR lo dice bajo el título: falla es un equipo que no funciona (no prende, no proyecta, no hay internet); daño es algo roto o golpeado, o un desperfecto del aula. Si en un daño de equipo el detalle dice que no funciona ("la laptop no prende"), el QR sugiere avisarlo como falla y lo pasa al reporte a TI con el detalle y las fotos, para que cuente en el semáforo. Cada aula ofrece solo lo que tiene: las Chromebooks aparecen solo en los MediaLab (sección ML), y el proyector o parlante solo donde hay clases o audio; el Worker rechaza el resto. Pasan por Pendiente, En proceso y Resuelto, con lo que se hizo. Los equipos tecnológicos los atiende TI, que recibe la notificación, y COA solo los mira. Los desperfectos del local los atiende COA; TI también los ve y los puede cerrar. COA entra con su correo (secreto `COA_EMAILS`): ve todo el panel en modo lectura y solo cambia cosas en esta pestaña.
- **Asistencia guiada**: al elegir la falla, el docente ve "Antes de avisar, prueba esto" con los pasos que TI escribió en la ficha de esa falla ("Qué puede probar el docente"). Si toca "Ya funciona", queda registrado como autosolución y TI no recibe reporte. Si igual avisa, el reporte llega con la ficha que vio, para que TI no repita esos pasos. Mientras lee los pasos, los dos botones para avisar quedan fijos al pie de la pantalla. "No puedo continuar mi clase" sigue avisando directo, y si ya hay un reporte de esa falla en el aula no se muestran los pasos. El Observatorio cuenta cuántas veces lo resolvió el docente y cuántas igual tuvo que avisar.
- **Fotos de evidencia** (opcional, hasta 3 por reporte): el celular reduce cada una a 1280 px en JPEG antes de subirla (una foto de 5 MB queda en unos 400 KB), se guardan en R2 y TI las ve en el dashboard y en el detalle del aula.
- **Inicio del docente** (`/docente`): para quien no sabe escanear con la cámara del celular. Un botón grande abre la cámara dentro de la página y lee el QR del aula; también puede elegir su aula de una lista (busca por número o sección). Se puede agregar a la pantalla del celular como app.
- **Estado para el docente**: en su inicio, "Tus reportes" lista sus fallas y daños con su estado (Recibido, En atención, Escalado o Resuelto); los resueltos se ven 7 días y la lista se actualiza al volver a la app. Va plegado, con solo el título y cuántos siguen sin resolver, para no tapar la lista de aulas; al abrirlo salen primero los sin resolver. En la página del QR, los reportes del aula que hizo él dicen "Lo reportaste tú", y arriba aparecen los suyos que TI resolvió en los últimos 2 días. Así no tiene que preguntar por WhatsApp en qué va.
- **QR imprimibles** (`/qr-aulas`): un QR por aula, listo para imprimir. Se puede buscar un aula, imprimir solo su QR en grande y abrir "Probar" para ver la página que verá el docente.
- **Acceso con Cloudflare Access**: TI (correos del secreto `TI_EMAILS`) usa todo el panel; los docentes (`@innovaschools.edu.pe`) solo la página del QR. Guía: [docs/cloudflare-access.md](docs/cloudflare-access.md).
- **Sin Access** (desarrollo local): TI entra con la clave `TOKEN_TI`, y `DEV_EMAIL_DOCENTE` simula a un docente en la página del QR. Las claves solo funcionan en `localhost`: si en producción faltara la configuración de Access, nadie entra.
- **Protección de datos**: la API rechaza cambios y WebSockets que vienen de otro sitio (CSRF) y los cuerpos de formulario o texto plano; solo recibe JSON y fotos. Las notificaciones solo se envían a los servicios push de Chrome, Edge, Firefox y Safari, también las suscripciones guardadas antes de esa regla. Las fotos de evidencia y las respuestas de la API no quedan guardadas en el navegador (`Cache-Control: no-store`). En el Excel del Historial, un texto que empieza con `=`, `+`, `-` o `@` se guarda con un apóstrofo delante para que no se abra como fórmula. La conexión en vivo se cierra cada 30 minutos y el panel se reconecta solo, así quien sale de TI o de COA deja de recibir avisos.

### Sprint 3 · Base del asistente
- **Base de conocimiento** (`/fichas`): TI escribe fichas por tipo de falla: cómo se ve la falla, causas posibles, los pasos que el docente puede probar solo, el procedimiento que solo hace TI y cuándo llamar a TI. Tiene buscador y filtro por tipo. Junto con los casos resueltos (causa y qué se hizo) serán la base del asistente.

## Estructura

```
migrations/0001_inicial.sql   tablas Aula, Activo, Profesor, Reporte
migrations/0002_foto_reporte.sql  primera versión de la foto del reporte
migrations/0003_fotos_multiples.sql  tabla foto_reporte (hasta 3 fotos por reporte)
migrations/0004_causa.sql          columna causa: qué se encontró, aparte de qué se hizo
migrations/0005_fichas.sql         tabla ficha (fichas de solución de TI)
migrations/0006_secciones.sql      pabellón, nivel y sección de cada aula (cuadro de asignación 2026)
migrations/0007_entrada.sql       por dónde llegó cada reporte del docente (QR impreso, escáner o lista)
migrations/0008_push.sql          navegadores de TI suscritos a las notificaciones push
migrations/0009_aula_207.sql      el aula 207 es un MediaLab (ML)
migrations/0010_tipos_falla.sql   tipos de falla audio, impresora y periféricos; estado "escalado" (reconstruye reporte y ficha)
migrations/0011_atencion_tecnica.sql  ticket GLPI, observaciones, quién registró y el historial de cambios (reporte_evento)
migrations/0012_fichas_ti.sql      causas posibles y procedimiento de TI en las fichas
migrations/0013_asistencia_guiada.sql  autosoluciones del docente y la ficha que vio antes de avisar
migrations/0014_espacios.sql       Welcome Lobby y Sala de docentes; qué computadora hay en cada ambiente (laptop o AIO)
migrations/0015_sala_docentes_piso.sql  la Sala de docentes está en el piso 2
migrations/0016_danos.sql          daños de equipos tecnológicos y del local, con sus fotos
migrations/0017_fichas_ubuntu.sql  pasos de las fichas iniciales para Ubuntu Desktop (solo si no se editaron)
migrations/0018_equipos_ambiente.sql  qué fallas ofrece cada ambiente: sin proyector donde no hay clases, impresora solo en el WL, sin audio en WL ni SD
migrations/0019_ecran.sql          tipo de falla ecran; reconstruye reporte y ficha sin CHECK en tipo_falla (lo valida el Worker)
migrations/0020_red_wifi.sql       red Wi-Fi propia del WL y la SD; {red} en los pasos de las fichas
migrations/0021_red_aulas.sql      las aulas usan "aula_innova"; las fichas que la nombran a mano pasan a {red}
seed/aulas.sql                las 31 aulas de SMP1 con pabellón, nivel y sección
seed/fichas-iniciales.sql     7 fichas de Base de conocimiento con pasos para el docente (se cargan una vez, no duplican)
worker/index.ts               API: /api/aulas, /api/reportes, /api/en-vivo
worker/sede-en-vivo.ts        Durable Object que reparte los cambios en vivo
src/                          panel de TI en React (Registro, Dashboard, Detalle, Observatorio, QR)
src/qr/ + qr.html              página liviana del QR para docentes
src/qr/docente.ts + docente.html  inicio del docente: escanear el QR dentro de la página o elegir el aula
worker/sesion.ts              verificación de Cloudflare Access y roles
worker/push.ts                envío de notificaciones push (cifrado RFC 8291 y firma VAPID con WebCrypto)
public/sw.js                  service worker que muestra las notificaciones en el navegador de TI
scripts/claves-push.mjs       genera las claves VAPID (npm run push:claves)
docs/cloudflare-access.md     guía para configurar Access
shared/tipos.ts               tipos compartidos entre frontend y Worker
```

## Arrancar en tu computadora

Necesitas Node.js 20 o superior.

```bash
npm install
cp .dev.vars.example .dev.vars        # define TOKEN_TI y el docente de prueba
npm run db:migrar:local                # crea las tablas en la base local
npm run db:semilla:local               # carga aulas de ejemplo
npm run dev                            # abre http://localhost:5173
```

Entra con la clave que pusiste en `.dev.vars`. Para probar la página del docente abre http://localhost:5173/r/204.

## Publicar en Cloudflare

```bash
npx wrangler login
npx wrangler d1 create incidencias     # copia el database_id que devuelve
npx wrangler r2 bucket create aulaviva-fotos   # fotos de evidencia
# pega ese id en wrangler.jsonc (campo database_id)
npm run db:migrar:remoto
npm run db:semilla:remoto
npm run push:claves                    # muestra las claves de notificaciones y cómo guardarlas
npx wrangler secret put VAPID_PUBLICA
npx wrangler secret put VAPID_PRIVADA
npm run deploy
```

Te devolverá una URL `https://aulaviva.<tu-cuenta>.workers.dev`. Después configura Cloudflare Access con [docs/cloudflare-access.md](docs/cloudflare-access.md).

## API

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/aulas` | Aulas con su semáforo calculado |
| GET | `/api/reportes?estado=abiertos` | Reportes no resueltos, urgentes primero |
| GET | `/api/reportes` | Últimos 100 reportes |
| GET | `/api/aulas/:id` | Detalle de un aula con su historial, los cambios de estado de cada reporte y promedios |
| GET | `/api/metricas?dias=30` | Indicadores del Observatorio |
| GET | `/api/historial?mes=2026-10` | Fallas y daños de un mes de Lima con su resumen (`mes=todo` trae todo; por defecto, el mes actual). Para `MONITOREO_EMAILS` y COA trae también `monitoreo` (rondas terminadas y minutos) |
| POST | `/api/reportes` | Registrar `{aula_id, tipo_falla, entrada, bloquea_clase, reportado_por_nombre, descripcion, reportado_en?}` (`entrada`: `whatsapp`, `presencial` u `otro`). `estado`: `abierto`, `en_atencion` (con `atendido_en`), `resuelto` (con `atendido_en`, `resuelto_en`, `causa`, `notas_resolucion`) o `escalado` (con `ticket_glpi`, `causa`); `observaciones` en todos menos resuelto; para registrarlo ya resuelto agrega `resuelto: true, atendido_en, resuelto_en, causa, notas_resolucion` |
| PATCH | `/api/reportes/:id` | `{estado: "en_atencion"}`, `{estado: "escalado", ticket_glpi, observaciones}` o `{estado: "resuelto", causa, notas_resolucion}`. Cada cambio queda en el historial |
| GET | `/api/reportes/:id/similares` | Casos resueltos y fichas del mismo tipo que comparten palabras con el detalle `{criterio, casos, fichas}`; cada uno trae `coincide` |
| GET | `/api/fichas` | Fichas de solución |
| POST | `/api/fichas` | Crear `{tipo_falla, titulo, sintomas, causas_posibles, pasos_docente, pasos_ti, cuando_llamar_ti}` (un paso por línea) |
| PUT / DELETE | `/api/fichas/:id` | Editar o borrar una ficha |
| GET | `/api/en-vivo` | WebSocket del panel: cambios de aulas y de daños |
| GET | `/api/sesion` | Quién está conectado, su rol y si ve Monitoreo ML (`monitorea`) |
| GET | `/api/monitoreo` | Aulas ML, la ronda en curso, las anteriores y el resumen de hoy y de 7 días (solo `MONITOREO_EMAILS`) |
| POST | `/api/monitoreo` | Empezar una ronda `{aula_id}`; la que estaba abierta termina ahora |
| PATCH / DELETE | `/api/monitoreo/:id` | `{hallazgos, nota}` mientras sigue, `{terminar: true, fin?}` para cerrarla; DELETE descarta una ronda abierta |
| GET | `/api/push` | Clave pública para suscribirse a las notificaciones (`null` si faltan las claves) |
| POST / DELETE | `/api/push` | Guarda o borra la suscripción push de este navegador (`PushSubscription.toJSON()`) |
| POST | `/api/push/prueba` | Envía una notificación de prueba a los navegadores de quien la pide |
| GET | `/api/qr` | Aulas para el inicio del docente |
| GET | `/api/qr/:codigo` | Estado del aula para el docente |
| POST | `/api/qr/:codigo/reportes` | Reporte del docente `{tipo_falla, bloquea_clase, descripcion}` |
| PUT | `/api/qr/:codigo/reportes/:id/foto` | Agrega una foto al reporte (JPEG, PNG o WebP, máx. 3 MB; hasta 3), solo su autor y en los 15 minutos siguientes |
| GET | `/api/reportes/:id/fotos/:n` | Ver la foto número `n` (0, 1 o 2) del reporte (solo TI) |
| GET | `/api/resumen-semanal?desde=AAAA-MM-DD&hasta=AAAA-MM-DD` | Resumen de la semana (días de Lima) para el correo del viernes; por defecto la semana actual. TI o el service token del reporte |

Con Access, la sesión viaja en la cookie de Cloudflare y el Worker verifica el token `Cf-Access-Jwt-Assertion`. Sin Access (solo en `localhost`), las rutas de TI piden `Authorization: Bearer <TOKEN_TI>` (el WebSocket usa `?token=`). Los cambios (POST, PUT, PATCH, DELETE) y el WebSocket deben venir del mismo sitio. Las rutas `/api/qr/*` son para docentes y TI; el resto, solo TI.

## Próximos pasos

1. Importar el historial del grupo de WhatsApp.
2. Rediseño visual del panel y de la página del QR.
3. Sprint 3: asistente RAG sobre las fichas y los casos resueltos.
