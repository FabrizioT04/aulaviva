# AulaViva

Plataforma para registrar incidencias tecnológicas de las aulas y ver su estado en vivo.
Stack: React (Vite) + Cloudflare Workers + D1 + Durable Objects + R2, todo en un solo Worker.

## Qué incluye

### Sprint 1 · Panel de TI

- **Registro rápido** (`/`): aula, tipo de falla, si bloquea la clase, docente y detalle.
- **Dashboard en vivo** (`/dashboard`): semáforo por aula (verde, amarillo, rojo) y lista de reportes abiertos ordenada por urgencia. Se actualiza sola por WebSocket. Toca un aula para ver su detalle.
- **Detalle de aula** (`/aula/:id`): historial completo, tiempos promedio y cómo se resolvió cada caso.
- **Observatorio** (`/observatorio`): incidencias, bloqueos y tiempos promedio de atención y resolución; incidencias por tipo de falla y aulas con más incidencias (7, 30 o 90 días).
- **Atender y resolver**: guarda `atendido_en` y `resuelto_en` (tus métricas de tiempo) y pide las notas de resolución, que serán la base del asistente RAG del Sprint 3.

### Sprint 2 · Autorreporte por QR
- **Página del QR** (`/r/<aula>`): el docente escanea, elige la falla y si bloquea la clase, y TI lo ve al instante en el dashboard. Es una página aparte sin React (unos 3 KB) para que cargue rápido en el celular. Muestra lo ya reportado para evitar duplicados y, si es urgente, el tiempo promedio de atención.
- **Foto de evidencia** (opcional): el celular la reduce a 1280 px en JPEG antes de subirla (una foto de 5 MB queda en unos 400 KB), se guarda en R2 y TI la ve en el dashboard y en el detalle del aula.
- **QR imprimibles** (`/qr-aulas`): un QR por aula, listo para imprimir.
- **Acceso con Cloudflare Access**: TI (correos del secreto `TI_EMAILS`) usa todo el panel; los docentes (`@innovaschools.edu.pe`) solo la página del QR. Guía: [docs/cloudflare-access.md](docs/cloudflare-access.md).
- **Sin Access** (desarrollo local): TI entra con la clave `TOKEN_TI`, y `DEV_EMAIL_DOCENTE` simula a un docente en la página del QR.

## Estructura

```
migrations/0001_inicial.sql   tablas Aula, Activo, Profesor, Reporte
migrations/0002_foto_reporte.sql  columna foto_key del reporte
seed/aulas.sql                aulas de ejemplo (cámbialas por las reales)
worker/index.ts               API: /api/aulas, /api/reportes, /api/en-vivo
worker/sede-en-vivo.ts        Durable Object que reparte los cambios en vivo
src/                          panel de TI en React (Registro, Dashboard, Detalle, Observatorio, QR)
src/qr/ + qr.html              página liviana del QR para docentes
worker/sesion.ts              verificación de Cloudflare Access y roles
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
npm run deploy
```

Te devolverá una URL `https://aulaviva.<tu-cuenta>.workers.dev`. Después configura Cloudflare Access con [docs/cloudflare-access.md](docs/cloudflare-access.md).

## API

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/aulas` | Aulas con su semáforo calculado |
| GET | `/api/reportes?estado=abiertos` | Reportes no resueltos, urgentes primero |
| GET | `/api/reportes` | Últimos 100 reportes |
| GET | `/api/aulas/:id` | Detalle de un aula con su historial y promedios |
| GET | `/api/metricas?dias=30` | Indicadores del Observatorio |
| POST | `/api/reportes` | Registrar `{aula_id, tipo_falla, bloquea_clase, reportado_por_nombre, descripcion}` |
| PATCH | `/api/reportes/:id` | `{estado: "en_atencion"}` o `{estado: "resuelto", notas_resolucion}` |
| GET | `/api/en-vivo` | WebSocket del dashboard |
| GET | `/api/sesion` | Quién está conectado y su rol |
| GET | `/api/qr/:codigo` | Estado del aula para el docente |
| POST | `/api/qr/:codigo/reportes` | Reporte del docente `{tipo_falla, bloquea_clase, descripcion}` |
| PUT | `/api/qr/:codigo/reportes/:id/foto` | Foto del reporte (JPEG, PNG o WebP, máx. 3 MB), solo su autor y en los 15 minutos siguientes |
| GET | `/api/reportes/:id/foto` | Ver la foto (solo TI) |

Con Access, la sesión viaja en la cookie de Cloudflare y el Worker verifica el token `Cf-Access-Jwt-Assertion`. Sin Access, las rutas de TI piden `Authorization: Bearer <TOKEN_TI>` (el WebSocket usa `?token=`). Las rutas `/api/qr/*` son para docentes y TI; el resto, solo TI.

## Próximos pasos

1. Endpoint de resumen semanal para el reporte de los viernes.
2. Importar el historial del grupo de WhatsApp para el Observatorio.
3. Sprint 3: asistente RAG sobre las notas de resolución.
