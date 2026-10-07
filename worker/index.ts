import type { AulaConEstado, EventoEnVivo, TipoFalla } from "../shared/tipos";
import { SedeEnVivo } from "./sede-en-vivo";

export { SedeEnVivo };

export interface Env {
  DB: D1Database;
  SEDE_EN_VIVO: DurableObjectNamespace<SedeEnVivo>;
  TOKEN_TI?: string; // clave de acceso para el área de TI (Sprint 1)
}

const TIPOS_FALLA: TipoFalla[] = ["internet", "proyector", "pc", "otro"];
const SEDE = "smp1";

// El semáforo se calcula a partir de los reportes no resueltos:
// rojo = alguno bloquea la clase, amarillo = falla sin bloqueo, verde = operativa.
const SQL_AULAS = `
  SELECT a.id, a.codigo, a.nombre, a.piso,
         COUNT(r.id) AS reportes_abiertos,
         CASE
           WHEN SUM(r.bloquea_clase) > 0 THEN 'rojo'
           WHEN COUNT(r.id) > 0 THEN 'amarillo'
           ELSE 'verde'
         END AS semaforo
  FROM aula a
  LEFT JOIN reporte r ON r.aula_id = a.id AND r.estado <> 'resuelto'
  WHERE a.activa = 1`;

// Minutos promedio entre reporte → atención y reporte → resolución (tu "impacto medible")
const SQL_PROMEDIOS = `
  ROUND(AVG((julianday(atendido_en) - julianday(reportado_en)) * 1440), 1) AS prom_atencion_min,
  ROUND(AVG((julianday(resuelto_en) - julianday(reportado_en)) * 1440), 1) AS prom_resolucion_min`;

const SQL_REPORTES = `
  SELECT r.*, a.nombre AS aula_nombre
  FROM reporte r JOIN aula a ON a.id = r.aula_id`;

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return new Response("No encontrado", { status: 404 });
    }
    if (!(await autorizado(request, url, env))) {
      return json({ error: "No autorizado" }, 401);
    }

    try {
      return await enrutar(request, url, env);
    } catch (err) {
      console.error(err);
      return json({ error: "Error interno" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

async function enrutar(request: Request, url: URL, env: Env): Promise<Response> {
  const { pathname } = url;
  const metodo = request.method;

  if (pathname === "/api/en-vivo") {
    // El dashboard se conecta aquí por WebSocket
    return sede(env).fetch(request);
  }

  if (pathname === "/api/aulas" && metodo === "GET") {
    const { results } = await env.DB.prepare(`${SQL_AULAS} GROUP BY a.id ORDER BY a.codigo`).all();
    return json(results);
  }

  const aulaDetalle = pathname.match(/^\/api\/aulas\/(\d+)$/);
  if (aulaDetalle && metodo === "GET") {
    const id = Number(aulaDetalle[1]);
    const aula = await env.DB.prepare(`${SQL_AULAS} AND a.id = ? GROUP BY a.id`).bind(id).first();
    if (!aula) return json({ error: "Aula no encontrada" }, 404);
    const [reportes, resumen] = await env.DB.batch([
      env.DB.prepare(`${SQL_REPORTES} WHERE r.aula_id = ? ORDER BY r.reportado_en DESC LIMIT 200`).bind(id),
      env.DB.prepare(`SELECT COUNT(*) AS total, ${SQL_PROMEDIOS} FROM reporte WHERE aula_id = ?`).bind(id),
    ]);
    return json({ aula, reportes: reportes.results, resumen: resumen.results[0] });
  }

  if (pathname === "/api/metricas" && metodo === "GET") {
    const dias = Math.min(Math.max(Number(url.searchParams.get("dias")) || 30, 1), 365);
    const desde = `-${dias} days`;
    const filtro = `reportado_en >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)`;
    const [resumen, porTipo, ranking] = await env.DB.batch([
      env.DB.prepare(
        `SELECT COUNT(*) AS total,
                SUM(estado <> 'resuelto') AS abiertos,
                SUM(bloquea_clase) AS bloqueantes,
                ${SQL_PROMEDIOS}
         FROM reporte WHERE ${filtro}`,
      ).bind(desde),
      env.DB.prepare(
        `SELECT tipo_falla, COUNT(*) AS n FROM reporte WHERE ${filtro}
         GROUP BY tipo_falla ORDER BY n DESC`,
      ).bind(desde),
      env.DB.prepare(
        `SELECT a.id, a.codigo, a.nombre, COUNT(r.id) AS n
         FROM reporte r JOIN aula a ON a.id = r.aula_id
         WHERE r.${filtro}
         GROUP BY a.id ORDER BY n DESC, a.codigo LIMIT 10`,
      ).bind(desde),
    ]);
    return json({
      dias,
      resumen: resumen.results[0],
      por_tipo: porTipo.results,
      ranking_aulas: ranking.results,
    });
  }

  if (pathname === "/api/reportes" && metodo === "GET") {
    const abiertos = url.searchParams.get("estado") === "abiertos";
    const sql = abiertos
      ? `${SQL_REPORTES} WHERE r.estado <> 'resuelto'
         ORDER BY r.bloquea_clase DESC, r.reportado_en ASC`
      : `${SQL_REPORTES} ORDER BY r.reportado_en DESC LIMIT 100`;
    const { results } = await env.DB.prepare(sql).all();
    return json(results);
  }

  if (pathname === "/api/reportes" && metodo === "POST") {
    const datos = await request.json<Record<string, unknown>>().catch(() => null);
    const aulaId = Number(datos?.aula_id);
    const tipo = datos?.tipo_falla as TipoFalla;
    if (!Number.isInteger(aulaId) || !TIPOS_FALLA.includes(tipo)) {
      return json({ error: "Faltan el aula o el tipo de falla" }, 400);
    }
    const creado = await env.DB.prepare(
      `INSERT INTO reporte (aula_id, tipo_falla, bloquea_clase, descripcion, reportado_por_nombre, origen)
       VALUES (?, ?, ?, ?, ?, 'whatsapp') RETURNING id`,
    )
      .bind(
        aulaId,
        tipo,
        datos?.bloquea_clase ? 1 : 0,
        texto(datos?.descripcion),
        texto(datos?.reportado_por_nombre),
      )
      .first<{ id: number }>();
    await avisarCambio(env, aulaId);
    return json(creado, 201);
  }

  const coincide = pathname.match(/^\/api\/reportes\/(\d+)$/);
  if (coincide && metodo === "PATCH") {
    const id = Number(coincide[1]);
    const datos = await request.json<Record<string, unknown>>().catch(() => null);
    const estado = datos?.estado;
    let sentencia: D1PreparedStatement;
    if (estado === "en_atencion") {
      sentencia = env.DB.prepare(
        `UPDATE reporte SET estado = 'en_atencion',
           atendido_en = COALESCE(atendido_en, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE id = ? AND estado = 'abierto' RETURNING aula_id`,
      ).bind(id);
    } else if (estado === "resuelto") {
      sentencia = env.DB.prepare(
        `UPDATE reporte SET estado = 'resuelto',
           atendido_en = COALESCE(atendido_en, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
           resuelto_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           notas_resolucion = ?
         WHERE id = ? AND estado <> 'resuelto' RETURNING aula_id`,
      ).bind(texto(datos?.notas_resolucion), id);
    } else {
      return json({ error: "Estado no válido" }, 400);
    }
    const fila = await sentencia.first<{ aula_id: number }>();
    if (!fila) return json({ error: "Reporte no encontrado o ya actualizado" }, 404);
    await avisarCambio(env, fila.aula_id);
    return json({ ok: true });
  }

  return json({ error: "Ruta no encontrada" }, 404);
}

// Recalcula el semáforo del aula y lo envía a todos los dashboards abiertos
async function avisarCambio(env: Env, aulaId: number) {
  const aula = await env.DB.prepare(`${SQL_AULAS} AND a.id = ? GROUP BY a.id`)
    .bind(aulaId)
    .first<AulaConEstado>();
  if (!aula) return;
  const evento: EventoEnVivo = { tipo: "cambio", aula };
  await sede(env).difundir(evento);
}

function sede(env: Env) {
  return env.SEDE_EN_VIVO.get(env.SEDE_EN_VIVO.idFromName(SEDE));
}

// Sprint 1: solo TI usa el sistema, con una clave compartida.
// En el Sprint 2 se suma el login con Google para los docentes.
async function autorizado(request: Request, url: URL, env: Env): Promise<boolean> {
  if (!env.TOKEN_TI) return false;
  const enviado =
    request.headers.get("Authorization")?.replace(/^Bearer /, "") ??
    url.searchParams.get("token") ?? // los WebSockets del navegador no envían cabeceras
    "";
  const a = new TextEncoder().encode(enviado);
  const b = new TextEncoder().encode(env.TOKEN_TI);
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim().slice(0, 1000) : null;
}

function json(datos: unknown, status = 200) {
  return Response.json(datos, { status });
}
