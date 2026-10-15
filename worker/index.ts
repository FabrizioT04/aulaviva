import type { AulaConEstado, EstadoAulaQr, EventoEnVivo, Sesion, TipoFalla } from "../shared/tipos";
import { SedeEnVivo } from "./sede-en-vivo";
import { accessConfigurado, obtenerSesion } from "./sesion";

export { SedeEnVivo };

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  FOTOS: R2Bucket;
  SEDE_EN_VIVO: DurableObjectNamespace<SedeEnVivo>;
  // Cloudflare Access (producción)
  ACCESS_TEAM_DOMAIN?: string; // ej. https://innova-ti.cloudflareaccess.com
  ACCESS_AUD?: string; // "Application Audience (AUD) Tag" de la aplicación de Access
  TI_EMAILS?: string; // correos de TI separados por coma
  DOMINIO_DOCENTES?: string; // por defecto innovaschools.edu.pe
  // Desarrollo local sin Access
  TOKEN_TI?: string;
  DEV_EMAIL_DOCENTE?: string;
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

    // Página del QR: un HTML aparte y muy liviano (sin React) para el celular del docente
    if (/^\/r\/[\w-]+\/?$/.test(url.pathname)) {
      return env.ASSETS.fetch(new Request(new URL("/qr", url), request));
    }
    if (!url.pathname.startsWith("/api/")) {
      return new Response("No encontrado", { status: 404 });
    }

    try {
      const sesion = await obtenerSesion(request, url, env);
      if (url.pathname === "/api/sesion") {
        return sesion ? json(sesion) : json({ error: "No autorizado", access: accessConfigurado(env) }, 401);
      }
      if (!sesion) return json({ error: "No autorizado" }, 401);

      if (url.pathname.startsWith("/api/qr/")) return await enrutarQr(request, url, env, sesion);

      // El resto de la API es solo para el área de TI
      if (sesion.rol !== "ti") return json({ error: "Solo el área de TI puede usar esta sección" }, 403);
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

  const foto = pathname.match(/^\/api\/reportes\/(\d+)\/foto$/);
  if (foto && metodo === "GET") {
    const fila = await env.DB.prepare("SELECT foto_key FROM reporte WHERE id = ?")
      .bind(Number(foto[1]))
      .first<{ foto_key: string | null }>();
    const objeto = fila?.foto_key ? await env.FOTOS.get(fila.foto_key) : null;
    if (!objeto) return json({ error: "Este reporte no tiene foto" }, 404);
    return new Response(objeto.body, {
      headers: {
        "Content-Type": objeto.httpMetadata?.contentType ?? "image/jpeg",
        "Cache-Control": "private, max-age=86400",
      },
    });
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

// Rutas del QR: las usa el docente desde su celular (y TI para probar)
async function enrutarQr(request: Request, url: URL, env: Env, sesion: Sesion): Promise<Response> {
  const coincide = url.pathname.match(/^\/api\/qr\/([\w-]+)(\/reportes(?:\/(\d+)\/foto)?)?$/);
  if (!coincide) return json({ error: "Ruta no encontrada" }, 404);
  const codigo = coincide[1];

  const aula = await env.DB.prepare(`${SQL_AULAS} AND a.codigo = ? GROUP BY a.id`)
    .bind(codigo)
    .first<AulaConEstado>();
  if (!aula) return json({ error: "Este QR no corresponde a ninguna aula activa" }, 404);

  if (!coincide[2] && request.method === "GET") {
    const [abiertos, promedio] = await env.DB.batch([
      env.DB.prepare(
        `SELECT id, tipo_falla, bloquea_clase, estado, reportado_en FROM reporte
         WHERE aula_id = ? AND estado <> 'resuelto' ORDER BY reportado_en`,
      ).bind(aula.id),
      env.DB.prepare(
        `SELECT ROUND(AVG((julianday(atendido_en) - julianday(reportado_en)) * 1440), 1) AS min
         FROM reporte
         WHERE bloquea_clase = 1 AND atendido_en IS NOT NULL
           AND reportado_en >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-90 days')`,
      ),
    ]);
    const estado: EstadoAulaQr = {
      aula,
      abiertos: abiertos.results as EstadoAulaQr["abiertos"],
      prom_atencion_urgente_min: (promedio.results[0] as { min: number | null }).min,
      email: sesion.email,
    };
    return json(estado);
  }

  if (coincide[3] && request.method === "PUT") {
    return subirFoto(request, env, sesion, aula.id, Number(coincide[3]));
  }

  if (coincide[2] && !coincide[3] && request.method === "POST") {
    const datos = await request.json<Record<string, unknown>>().catch(() => null);
    const tipo = datos?.tipo_falla as TipoFalla;
    if (!TIPOS_FALLA.includes(tipo)) return json({ error: "Elige el tipo de falla" }, 400);

    // Evita reportes duplicados de la misma falla mientras siga abierta
    const repetido = await env.DB.prepare(
      `SELECT id FROM reporte WHERE aula_id = ? AND tipo_falla = ? AND estado <> 'resuelto' LIMIT 1`,
    )
      .bind(aula.id, tipo)
      .first();
    if (repetido) return json({ error: "Esta falla ya está reportada y TI ya fue avisado" }, 409);

    // El docente queda registrado en la tabla profesor la primera vez que reporta
    const profesor = await env.DB.prepare(
      `INSERT INTO profesor (nombre, email) VALUES (?, ?)
       ON CONFLICT(email) DO UPDATE SET email = excluded.email
       RETURNING id, activo`,
    )
      .bind(sesion.email.split("@")[0], sesion.email)
      .first<{ id: number; activo: number }>();
    if (!profesor?.activo) return json({ error: "Tu cuenta está desactivada para reportar" }, 403);

    const creado = await env.DB.prepare(
      `INSERT INTO reporte (aula_id, profesor_id, reportado_por_nombre, tipo_falla, bloquea_clase, descripcion, origen)
       VALUES (?, ?, ?, ?, ?, ?, 'qr') RETURNING id`,
    )
      .bind(aula.id, profesor.id, sesion.email, tipo, datos?.bloquea_clase ? 1 : 0, texto(datos?.descripcion))
      .first<{ id: number }>();
    await avisarCambio(env, aula.id);
    return json(creado, 201);
  }

  return json({ error: "Ruta no encontrada" }, 404);
}

const TIPOS_FOTO: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_FOTO_BYTES = 3 * 1024 * 1024; // el celular la comprime antes a ~200 KB

// Foto de evidencia: solo el docente que creó el reporte, una vez y en los 15 minutos siguientes
async function subirFoto(request: Request, env: Env, sesion: Sesion, aulaId: number, reporteId: number) {
  const tipo = (request.headers.get("Content-Type") ?? "").split(";")[0].trim();
  const extension = TIPOS_FOTO[tipo];
  if (!extension) return json({ error: "La foto debe ser JPG, PNG o WebP" }, 415);
  if (Number(request.headers.get("Content-Length") ?? 0) > MAX_FOTO_BYTES) {
    return json({ error: "La foto es demasiado grande" }, 413);
  }

  const reporte = await env.DB.prepare(
    `SELECT r.id FROM reporte r JOIN profesor p ON p.id = r.profesor_id
     WHERE r.id = ? AND r.aula_id = ? AND p.email = ? AND r.foto_key IS NULL
       AND r.reportado_en >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-15 minutes')`,
  )
    .bind(reporteId, aulaId, sesion.email)
    .first();
  if (!reporte) return json({ error: "No se puede agregar una foto a este reporte" }, 403);

  const datos = await request.arrayBuffer();
  if (datos.byteLength === 0 || datos.byteLength > MAX_FOTO_BYTES) {
    return json({ error: "La foto está vacía o es demasiado grande" }, 413);
  }

  const clave = `reportes/${reporteId}-${crypto.randomUUID()}.${extension}`;
  await env.FOTOS.put(clave, datos, { httpMetadata: { contentType: tipo } });
  await env.DB.prepare("UPDATE reporte SET foto_key = ? WHERE id = ?").bind(clave, reporteId).run();
  await avisarCambio(env, aulaId);
  return json({ ok: true }, 201);
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

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim().slice(0, 1000) : null;
}

function json(datos: unknown, status = 200) {
  return Response.json(datos, { status });
}
