# AulaViva

Plataforma para registrar incidencias tecnológicas de las aulas y ver su estado en vivo.
Stack: React (Vite) + Cloudflare Workers + D1 + Durable Objects + R2, todo en un solo Worker.

## Qué incluye

### Sprint 1 · Panel de TI

- **Registro rápido** (`/`): aula, por dónde llegó (WhatsApp, en persona u otro canal), tipo de falla, si bloquea la clase, docente, detalle y la fecha y hora real del reporte. Si TI ya lo atendió, se registra resuelto de una vez con la hora de llegada, la hora de solución, la causa y qué se hizo. Al elegir el aula y la falla avisa si ya hay un reporte abierto igual y muestra cómo se resolvió antes, con un botón para reusar esa solución.
- **Atención técnica** (en Registrar): el caso se registra como Pendiente, En atención, Resuelto o Escalado. Al escalar se anota el ticket de GLPI, el diagnóstico y lo que queda pendiente; desde el dashboard también se puede "Escalar" un reporte abierto. Cada cambio de estado queda guardado con quién y cuándo, y se ve en "Historial de cambios" dentro del detalle del aula.
- **Tipos de falla**: Internet, Proyector, PC y Otro a la vista; Audio, Impresora y Periféricos al tocar "Ver más" (en el panel y en la página del QR).
- **Dashboard en vivo** (`/dashboard`): semáforo por aula (verde, amarillo, rojo) y lista de reportes abiertos ordenada por urgencia. Se actualiza sola por WebSocket. Toca un aula para ver su detalle. Si se corta la conexión, avisa desde qué hora son los datos. Al resolver un reporte muestra casos parecidos ya resueltos (primero los de la misma aula) y las fichas de esa falla, con un botón para usar esa solución.
- **Detalle de aula** (`/aula/:id`): historial completo, tiempos promedio y cómo se resolvió cada caso.
- **Observatorio** (`/observatorio`): incidencias, bloqueos y tiempos promedio de atención y resolución; incidencias por tipo de falla, por dónde llegan los reportes (QR impreso, escáner o lista de /docente, WhatsApp) las 5 aulas con más incidencias, la tendencia por día (o por semana en 90 días), cómo quedaron (pendientes, escaladas, resueltas) y las fallas que se repiten en la misma aula, con sus causas para distinguir si es el mismo desperfecto que vuelve o problemas distintos (7, 30 o 90 días).
- **Notificaciones push** (botón de la campana): TI recibe un aviso en la PC o el celular con cada reporte de un docente, aunque el panel esté cerrado. Los urgentes quedan en pantalla hasta tocarlos, y al tocar el aviso se abre el aula. En iPhone, primero hay que agregar el panel a la pantalla de inicio. Las claves se generan una vez con `npm run push:claves`.
- **Atender y resolver**: guarda `atendido_en` y `resuelto_en` (tus métricas de tiempo) y pide las notas de resolución, que serán la base del asistente RAG del Sprint 3.

### Sprint 2 · Autorreporte por QR
- **Página del QR** (`/r/<aula>`): el docente escanea, elige la falla y toca "Avisar a TI" o, si la clase no puede seguir, "No puedo continuar mi clase" (urgente). El detalle y las fotos son opcionales y van plegados; en "Otro" el detalle es obligatorio. TI lo ve al instante en el dashboard. Es una página aparte sin React (unos 3 KB) para que cargue rápido en el celular. Muestra lo ya reportado para evitar duplicados y, si es urgente, el tiempo promedio de atención.
- **Fotos de evidencia** (opcional, hasta 3 por reporte): el celular reduce cada una a 1280 px en JPEG antes de subirla (una foto de 5 MB queda en unos 400 KB), se guardan en R2 y TI las ve en el dashboard y en el detalle del aula.
- **Inicio del docente** (`/docente`): para quien no sabe escanear con la cámara del celular. Un botón grande abre la cámara dentro de la página y lee el QR del aula; también puede elegir su aula de una lista (busca por número o sección). Se puede agregar a la pantalla del celular como app.
- **QR imprimibles** (`/qr-aulas`): un QR por aula, listo para imprimir. Se puede buscar un aula, imprimir solo su QR en grande y abrir "Probar" para ver la página que verá el docente.
- **Acceso con Cloudflare Access**: TI (correos del secreto `TI_EMAILS`) usa todo el panel; los docentes (`@innovaschools.edu.pe`) solo la página del QR. Guía: [docs/cloudflare-access.md](docs/cloudflare-access.md).
- **Sin Access** (desarrollo local): TI entra con la clave `TOKEN_TI`, y `DEV_EMAIL_DOCENTE` simula a un docente en la página del QR.

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
seed/aulas.sql                las 31 aulas de SMP1 con pabellón, nivel y sección
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
npx wrangler secret put TOKEN_TI       # clave temporal, hasta configurar Access
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
| POST | `/api/reportes` | Registrar `{aula_id, tipo_falla, entrada, bloquea_clase, reportado_por_nombre, descripcion, reportado_en?}` (`entrada`: `whatsapp`, `presencial` u `otro`). `estado`: `abierto`, `en_atencion` (con `atendido_en`), `resuelto` (con `atendido_en`, `resuelto_en`, `causa`, `notas_resolucion`) o `escalado` (con `ticket_glpi`, `causa`); `observaciones` en todos menos resuelto; para registrarlo ya resuelto agrega `resuelto: true, atendido_en, resuelto_en, causa, notas_resolucion` |
| PATCH | `/api/reportes/:id` | `{estado: "en_atencion"}`, `{estado: "escalado", ticket_glpi, observaciones}` o `{estado: "resuelto", causa, notas_resolucion}`. Cada cambio queda en el historial |
| GET | `/api/reportes/:id/similares` | Casos resueltos parecidos y fichas del mismo tipo de falla `{casos, fichas}` |
| GET | `/api/fichas` | Fichas de solución |
| POST | `/api/fichas` | Crear `{tipo_falla, titulo, sintomas, causas_posibles, pasos_docente, pasos_ti, cuando_llamar_ti}` (un paso por línea) |
| PUT / DELETE | `/api/fichas/:id` | Editar o borrar una ficha |
| GET | `/api/en-vivo` | WebSocket del dashboard |
| GET | `/api/sesion` | Quién está conectado y su rol |
| GET | `/api/push` | Clave pública para suscribirse a las notificaciones (`null` si faltan las claves) |
| POST / DELETE | `/api/push` | Guarda o borra la suscripción push de este navegador (`PushSubscription.toJSON()`) |
| POST | `/api/push/prueba` | Envía una notificación de prueba a los navegadores de quien la pide |
| GET | `/api/qr` | Aulas para el inicio del docente |
| GET | `/api/qr/:codigo` | Estado del aula para el docente |
| POST | `/api/qr/:codigo/reportes` | Reporte del docente `{tipo_falla, bloquea_clase, descripcion}` |
| PUT | `/api/qr/:codigo/reportes/:id/foto` | Agrega una foto al reporte (JPEG, PNG o WebP, máx. 3 MB; hasta 3), solo su autor y en los 15 minutos siguientes |
| GET | `/api/reportes/:id/fotos/:n` | Ver la foto número `n` (0, 1 o 2) del reporte (solo TI) |
| GET | `/api/resumen-semanal?desde=AAAA-MM-DD&hasta=AAAA-MM-DD` | Resumen de la semana (días de Lima) para el correo del viernes; por defecto la semana actual. TI o el service token del reporte |

Con Access, la sesión viaja en la cookie de Cloudflare y el Worker verifica el token `Cf-Access-Jwt-Assertion`. Sin Access, las rutas de TI piden `Authorization: Bearer <TOKEN_TI>` (el WebSocket usa `?token=`). Las rutas `/api/qr/*` son para docentes y TI; el resto, solo TI.

## Próximos pasos

1. Importar el historial del grupo de WhatsApp.
2. Rediseño visual del panel y de la página del QR.
3. Sprint 3: asistente RAG sobre las fichas y los casos resueltos.
