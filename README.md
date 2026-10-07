# AulaViva · Sprint 1 (MVP)

Plataforma para registrar incidencias tecnológicas de las aulas y ver su estado en vivo.
Stack: React (Vite) + Cloudflare Workers + D1 + Durable Objects, todo en un solo Worker.

## Qué incluye

- **Registro rápido** (`/`): aula, tipo de falla, si bloquea la clase, docente y detalle.
- **Dashboard en vivo** (`/dashboard`): semáforo por aula (verde, amarillo, rojo) y lista de reportes abiertos ordenada por urgencia. Se actualiza sola por WebSocket. Toca un aula para ver su detalle.
- **Detalle de aula** (`/aula/:id`): historial completo, tiempos promedio y cómo se resolvió cada caso.
- **Observatorio** (`/observatorio`): incidencias, bloqueos y tiempos promedio de atención y resolución; incidencias por tipo de falla y aulas con más incidencias (7, 30 o 90 días).
- **Atender y resolver**: guarda `atendido_en` y `resuelto_en` (tus métricas de tiempo) y pide las notas de resolución, que serán la base del asistente RAG del Sprint 3.
- **Acceso de TI**: una clave compartida (`TOKEN_TI`). El login con Google para docentes llega en el Sprint 2.

## Estructura

```
migrations/0001_inicial.sql   tablas Aula, Activo, Profesor, Reporte
seed/aulas.sql                aulas de ejemplo (cámbialas por las reales)
worker/index.ts               API: /api/aulas, /api/reportes, /api/en-vivo
worker/sede-en-vivo.ts        Durable Object que reparte los cambios en vivo
src/                          frontend React (Registro, Dashboard, Detalle de aula, Observatorio)
shared/tipos.ts               tipos compartidos entre frontend y Worker
```

## Arrancar en tu computadora

Necesitas Node.js 20 o superior.

```bash
npm install
cp .dev.vars.example .dev.vars        # define tu TOKEN_TI local
npm run db:migrar:local                # crea las tablas en la base local
npm run db:semilla:local               # carga aulas de ejemplo
npm run dev                            # abre http://localhost:5173
```

Entra con la clave que pusiste en `.dev.vars`.

## Publicar en Cloudflare

```bash
npx wrangler login
npx wrangler d1 create incidencias     # copia el database_id que devuelve
# pega ese id en wrangler.jsonc (campo database_id)
npm run db:migrar:remoto
npm run db:semilla:remoto
npx wrangler secret put TOKEN_TI       # la clave de producción
npm run deploy
```

Te devolverá una URL `https://aulaviva.<tu-cuenta>.workers.dev`.

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

Todas piden `Authorization: Bearer <TOKEN_TI>` (el WebSocket usa `?token=`).

## Próximos pasos

1. Importar el historial del grupo de WhatsApp para que el Observatorio no arranque vacío.
2. Sprint 2: QR por aula, login con Google (`@innovaschools.edu.pe`) y fotos en R2.
