import { ENTRADAS } from "../shared/tipos";
import type { AulaConEstado, AulasDocente, EntradaReporte, EstadoAulaQr, EventoEnVivo, Sesion, TipoFalla } from "../shared/tipos";
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
  ACCESS_SERVICE_TOKEN_ID?: string; // Client ID del service token que usa el reporte semanal
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
  SELECT a.id, a.codigo, a.nombre, a.piso, a.pabellon, a.nivel, a.seccion,
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
  SELECT r.*, a.nombre AS aula_nombre, a.seccion AS aula_seccion,
    (SELECT COUNT(*) FROM foto_reporte f WHERE f.reporte_id = r.id) AS fotos
  FROM reporte r JOIN aula a ON a.id = r.aula_id`;

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    // Página del QR: un HTML aparte y muy liviano (sin React) para el celular del docente
    if (/^\/r\/[\w-]+\/?$/.test(url.pathname)) {
      return env.ASSETS.fetch(new Request(new URL("/qr", url), request));
    }
    // Inicio del docente: escanear el QR desde la página o elegir el aula de una lista
    if (/^\/docente\/?$/.test(url.pathname)) {
      return env.ASSETS.fetch(new Request(new URL("/docente", url), request));
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

      // El reporte semanal (Apps Script) entra con un service token y solo puede leer esto
      if (url.pathname === "/api/resumen-semanal" && request.method === "GET" && sesion.rol !== "docente") {
        return await resumenSemanal(url, env);
      }
      if (sesion.rol === "servicio") return json({ error: "Este acceso solo sirve para el resumen semanal" }, 403);

      if (url.pathname === "/api/qr" || url.pathname.startsWith("/api/qr/")) return await enrutarQr(request, url, env, sesion);

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
    const [resumen, porTipo, ranking, porEntrada] = await env.DB.batch([
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
      // Los reportes por QR anteriores a la columna entrada vinieron todos del QR impreso
      env.DB.prepare(
        `SELECT CASE WHEN origen = 'whatsapp' THEN 'whatsapp' ELSE COALESCE(entrada, 'qr') END AS entrada, COUNT(*) AS n
         FROM reporte WHERE ${filtro} GROUP BY 1 ORDER BY n DESC`,
      ).bind(desde),
    ]);
    return json({
      dias,
      resumen: resumen.results[0],
      por_tipo: porTipo.results,
      por_entrada: porEntrada.results,
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

  // TI registra lo que llega por WhatsApp. Puede indicar la hora real del mensaje y, si ya
  // lo atendió, registrarlo resuelto de una vez para que los tiempos queden bien medidos.
  if (pathname === "/api/reportes" && metodo === "POST") {
    const datos = await request.json<Record<string, unknown>>().catch(() => null);
    const aulaId = Number(datos?.aula_id);
    const tipo = datos?.tipo_falla as TipoFalla;
    if (!Number.isInteger(aulaId) || !TIPOS_FALLA.includes(tipo)) {
      return json({ error: "Faltan el aula o el tipo de falla" }, 400);
    }
    const ahora = new Date().toISOString();
    const reportadoEn = datos?.reportado_en == null ? ahora : fecha(datos.reportado_en);
    const resuelto = datos?.resuelto === true;
    const atendidoEn = resuelto ? fecha(datos?.atendido_en ?? ahora) : null;
    const resueltoEn = resuelto ? fecha(datos?.resuelto_en ?? ahora) : null;
    if (!reportadoEn || (resuelto && (!atendidoEn || !resueltoEn))) {
      return json({ error: "Alguna fecha no es válida o está en el futuro" }, 400);
    }
    if (resuelto && !(reportadoEn <= atendidoEn! && atendidoEn! <= resueltoEn!)) {
      return json({ error: "Las horas deben ir en orden: mensaje, llegada al aula, resuelto" }, 400);
    }
    const creado = await env.DB.prepare(
      `INSERT INTO reporte (aula_id, tipo_falla, bloquea_clase, descripcion, reportado_por_nombre, origen,
         reportado_en, estado, atendido_en, resuelto_en, causa, notas_resolucion)
       VALUES (?, ?, ?, ?, ?, 'whatsapp', ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
      .bind(
        aulaId,
        tipo,
        datos?.bloquea_clase ? 1 : 0,
        texto(datos?.descripcion),
        texto(datos?.reportado_por_nombre),
        reportadoEn,
        resuelto ? "resuelto" : "abierto",
        atendidoEn,
        resueltoEn,
        resuelto ? texto(datos?.causa) : null,
        resuelto ? texto(datos?.notas_resolucion) : null,
      )
      .first<{ id: number }>();
    await avisarCambio(env, aulaId);
    return json(creado, 201);
  }

  // Foto número n (0, 1 o 2) del reporte, en el orden en que se subieron
  const foto = pathname.match(/^\/api\/reportes\/(\d+)\/fotos\/(\d)$/);
  if (foto && metodo === "GET") {
    const fila = await env.DB.prepare(
      "SELECT r2_key FROM foto_reporte WHERE reporte_id = ? ORDER BY id LIMIT 1 OFFSET ?",
    )
      .bind(Number(foto[1]), Number(foto[2]))
      .first<{ r2_key: string }>();
    const objeto = fila ? await env.FOTOS.get(fila.r2_key) : null;
    if (!objeto) return json({ error: "Este reporte no tiene esa foto" }, 404);
    return new Response(objeto.body, {
      headers: {
        "Content-Type": objeto.httpMetadata?.contentType ?? "image/jpeg",
        "Cache-Control": "private, max-age=86400",
      },
    });
  }

  if (pathname === "/api/fichas" && metodo === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT * FROM ficha ORDER BY tipo_falla, titulo COLLATE NOCASE",
    ).all();
    return json(results);
  }

  const ficha = pathname.match(/^\/api\/fichas(?:\/(\d+))?$/);
  if (ficha && (metodo === "POST" || metodo === "PUT")) {
    const datos = await request.json<Record<string, unknown>>().catch(() => null);
    const tipo = datos?.tipo_falla as TipoFalla;
    const titulo = texto(datos?.titulo);
    if (!TIPOS_FALLA.includes(tipo) || !titulo) return json({ error: "Faltan el tipo de falla o el título" }, 400);
    const valores = [tipo, titulo, texto(datos?.sintomas), texto(datos?.pasos_docente), texto(datos?.cuando_llamar_ti)];
    if (metodo === "POST" && !ficha[1]) {
      const creada = await env.DB.prepare(
        `INSERT INTO ficha (tipo_falla, titulo, sintomas, pasos_docente, cuando_llamar_ti)
         VALUES (?, ?, ?, ?, ?) RETURNING id`,
      )
        .bind(...valores)
        .first<{ id: number }>();
      return json(creada, 201);
    }
    if (metodo === "PUT" && ficha[1]) {
      const cambiada = await env.DB.prepare(
        `UPDATE ficha SET tipo_falla = ?, titulo = ?, sintomas = ?, pasos_docente = ?, cuando_llamar_ti = ?,
           actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? RETURNING id`,
      )
        .bind(...valores, Number(ficha[1]))
        .first();
      return cambiada ? json({ ok: true }) : json({ error: "Ficha no encontrada" }, 404);
    }
  }
  if (ficha?.[1] && metodo === "DELETE") {
    const borrada = await env.DB.prepare("DELETE FROM ficha WHERE id = ? RETURNING id").bind(Number(ficha[1])).first();
    return borrada ? json({ ok: true }) : json({ error: "Ficha no encontrada" }, 404);
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
           causa = ?,
           notas_resolucion = ?
         WHERE id = ? AND estado <> 'resuelto' RETURNING aula_id`,
      ).bind(texto(datos?.causa), texto(datos?.notas_resolucion), id);
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
  // Lista de aulas para el inicio del docente, por si no puede escanear el QR
  if (url.pathname === "/api/qr" && request.method === "GET") {
    const { results } = await env.DB.prepare(`${SQL_AULAS} GROUP BY a.id ORDER BY a.piso, a.codigo`).all<AulaConEstado>();
    const respuesta: AulasDocente = { aulas: results, email: sesion.email };
    return json(respuesta);
  }
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

    const entrada = ENTRADAS.includes(datos?.entrada as EntradaReporte) ? (datos!.entrada as EntradaReporte) : "qr";
    const creado = await env.DB.prepare(
      `INSERT INTO reporte (aula_id, profesor_id, reportado_por_nombre, tipo_falla, bloquea_clase, descripcion, origen, entrada)
       VALUES (?, ?, ?, ?, ?, ?, 'qr', ?) RETURNING id`,
    )
      .bind(aula.id, profesor.id, sesion.email, tipo, datos?.bloquea_clase ? 1 : 0, texto(datos?.descripcion), entrada)
      .first<{ id: number }>();
    await avisarCambio(env, aula.id);
    return json(creado, 201);
  }

  return json({ error: "Ruta no encontrada" }, 404);
}

const TIPOS_FOTO: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_FOTO_BYTES = 3 * 1024 * 1024; // el celular la comprime antes a ~200 KB
const MAX_FOTOS = 3;

// Fotos de evidencia: solo el docente que creó el reporte, hasta 3 y en los 15 minutos siguientes
async function subirFoto(request: Request, env: Env, sesion: Sesion, aulaId: number, reporteId: number) {
  const tipo = (request.headers.get("Content-Type") ?? "").split(";")[0].trim();
  const extension = TIPOS_FOTO[tipo];
  if (!extension) return json({ error: "La foto debe ser JPG, PNG o WebP" }, 415);
  if (Number(request.headers.get("Content-Length") ?? 0) > MAX_FOTO_BYTES) {
    return json({ error: "La foto es demasiado grande" }, 413);
  }

  const reporte = await env.DB.prepare(
    `SELECT r.id FROM reporte r JOIN profesor p ON p.id = r.profesor_id
     WHERE r.id = ? AND r.aula_id = ? AND p.email = ?
       AND r.reportado_en >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-15 minutes')
       AND (SELECT COUNT(*) FROM foto_reporte f WHERE f.reporte_id = r.id) < ?`,
  )
    .bind(reporteId, aulaId, sesion.email, MAX_FOTOS)
    .first();
  if (!reporte) return json({ error: "No se puede agregar una foto a este reporte" }, 403);

  const datos = await request.arrayBuffer();
  if (datos.byteLength === 0 || datos.byteLength > MAX_FOTO_BYTES) {
    return json({ error: "La foto está vacía o es demasiado grande" }, 413);
  }

  const clave = `reportes/${reporteId}-${crypto.randomUUID()}.${extension}`;
  await env.FOTOS.put(clave, datos, { httpMetadata: { contentType: tipo } });
  // Vuelve a contar al guardar, por si llegan dos fotos a la vez
  const guardada = await env.DB.prepare(
    `INSERT INTO foto_reporte (reporte_id, r2_key)
     SELECT ?, ? WHERE (SELECT COUNT(*) FROM foto_reporte WHERE reporte_id = ?) < ?
     RETURNING id`,
  )
    .bind(reporteId, clave, reporteId, MAX_FOTOS)
    .first();
  if (!guardada) {
    await env.FOTOS.delete(clave);
    return json({ error: `El reporte ya tiene ${MAX_FOTOS} fotos` }, 409);
  }
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

// Resumen de una semana para el correo del viernes. Las fechas son días de Lima (UTC-5,
// sin horario de verano): ?desde=2026-10-12&hasta=2026-10-18. Por defecto, la semana actual.
async function resumenSemanal(url: URL, env: Env): Promise<Response> {
  const DIA = 86_400_000;
  const LIMA = -5 * 3_600_000;
  const hoyLima = new Date(Date.now() + LIMA);
  const lunes = new Date(Date.UTC(hoyLima.getUTCFullYear(), hoyLima.getUTCMonth(), hoyLima.getUTCDate()));
  lunes.setUTCDate(lunes.getUTCDate() - ((lunes.getUTCDay() + 6) % 7));
  const dia = (texto: string | null, porDefecto: Date) => {
    if (!texto) return porDefecto;
    const d = /^\d{4}-\d{2}-\d{2}$/.test(texto) ? new Date(`${texto}T00:00:00Z`) : new Date(NaN);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const desde = dia(url.searchParams.get("desde"), lunes);
  const hasta = dia(url.searchParams.get("hasta"), new Date(lunes.getTime() + 6 * DIA));
  if (!desde || !hasta || hasta < desde || hasta.getTime() - desde.getTime() > 31 * DIA) {
    return json({ error: "Usa ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD, con hasta 31 días" }, 400);
  }
  // Medianoche de Lima expresada en UTC
  const inicio = new Date(desde.getTime() - LIMA).toISOString();
  const fin = new Date(hasta.getTime() + DIA - LIMA).toISOString();
  const filtro = "r.reportado_en >= ? AND r.reportado_en < ?";

  const [resumen, porTipo, reportes, anteriores] = await env.DB.batch([
    env.DB.prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(estado = 'resuelto'), 0) AS resueltos,
              COALESCE(SUM(estado <> 'resuelto'), 0) AS pendientes,
              COALESCE(SUM(bloquea_clase), 0) AS urgentes,
              ${SQL_PROMEDIOS}
       FROM reporte r WHERE ${filtro}`,
    ).bind(inicio, fin),
    env.DB.prepare(
      `SELECT tipo_falla, COUNT(*) AS n FROM reporte r WHERE ${filtro} GROUP BY tipo_falla ORDER BY n DESC`,
    ).bind(inicio, fin),
    env.DB.prepare(
      `SELECT r.reportado_en, a.nombre || COALESCE(' · ' || a.seccion, '') AS aula, r.tipo_falla, r.bloquea_clase, r.estado, r.origen,
              r.descripcion, r.causa, r.notas_resolucion,
              ROUND((julianday(r.atendido_en) - julianday(r.reportado_en)) * 1440) AS atencion_min,
              ROUND((julianday(r.resuelto_en) - julianday(r.reportado_en)) * 1440) AS resolucion_min
       FROM reporte r JOIN aula a ON a.id = r.aula_id
       WHERE ${filtro} ORDER BY r.reportado_en`,
    ).bind(inicio, fin),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM reporte r WHERE r.estado <> 'resuelto' AND r.reportado_en < ?`,
    ).bind(inicio),
  ]);
  const fecha = (d: Date) => d.toISOString().slice(0, 10);
  return json({
    desde: fecha(desde),
    hasta: fecha(hasta),
    resumen: resumen.results[0],
    por_tipo: porTipo.results,
    reportes: reportes.results,
    pendientes_anteriores: (anteriores.results[0] as { n: number }).n,
  });
}

function sede(env: Env) {
  return env.SEDE_EN_VIVO.get(env.SEDE_EN_VIVO.idFromName(SEDE));
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim().slice(0, 1000) : null;
}

// Fecha ISO de hasta un año atrás y no futura (con 5 min de margen por relojes desfasados)
function fecha(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const ms = Date.parse(valor);
  const ahora = Date.now();
  if (Number.isNaN(ms) || ms > ahora + 5 * 60_000 || ms < ahora - 366 * 86_400_000) return null;
  return new Date(Math.min(ms, ahora)).toISOString();
}

function json(datos: unknown, status = 200) {
  return Response.json(datos, { status });
}
