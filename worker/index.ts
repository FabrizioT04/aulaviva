import { EQUIPO_DANOS, seccionesDe, TIPOS_DANO, type TipoDano } from "../shared/danos";
import { comparar, raices } from "../shared/parecido";
import { ENTRADAS, ENTRADAS_TI, etiquetaFalla, fallasDe, paraAmbiente, TIPOS_FALLA } from "../shared/tipos";
import type { AulaConEstado, AulasDocente, EntradaReporte, EntradaTi, EstadoReporte, EstadoAulaQr, EstadoMiReporte, EventoEnVivo, Ficha, GuiaDocente, Historial, MiReporte, Recurrente, Reporte, Sesion, Similares, TipoFalla } from "../shared/tipos";
import { agruparLaboratorios, enrutarMonitoreo, leer as leerRonda, puedeMonitorear, puedeVerMonitoreo, SQL_AULAS_ML, SQL_MONITOREO, type Fila as FilaRonda } from "./monitoreo";
import { crearDano, enrutarDanos, guardarFoto as guardarFotoDano, puedeVerDanos, SQL_DANOS, type AlCrearDano } from "./danos";
import { sede, SedeEnVivo } from "./sede-en-vivo";
import { enviarPush, type ClavesVapid, type SuscripcionPush } from "./push";
import { accessConfigurado, obtenerSesion, sigueEnTi } from "./sesion";

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
  COA_EMAILS?: string; // correos de COA: ven todo el panel y solo cambian Daños y mantenimiento
  MONITOREO_EMAILS?: string; // correos de TI que ven la pestaña Monitoreo ML; sin lista, todo TI
  ACCESS_SERVICE_TOKEN_ID?: string; // Client ID del service token que usa el reporte semanal
  DOMINIO_DOCENTES?: string; // por defecto innovaschools.edu.pe
  // Notificaciones push a TI (secretos; se generan con `npm run push:claves`)
  VAPID_PUBLICA?: string;
  VAPID_PRIVADA?: string;
  // Desarrollo local sin Access
  TOKEN_TI?: string;
  TOKEN_COA?: string;
  DEV_EMAIL_DOCENTE?: string;
}

const ESTADOS: EstadoReporte[] = ["abierto", "en_atencion", "escalado", "resuelto"];

// El semáforo se calcula a partir de los reportes no resueltos:
// rojo = alguno bloquea la clase, amarillo = falla sin bloqueo, verde = operativa.
const SQL_AULAS = `
  SELECT a.id, a.codigo, a.nombre, a.piso, a.pabellon, a.nivel, a.seccion, a.equipo, a.clases, a.impresora, a.audio, a.red_wifi,
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
    (SELECT COUNT(*) FROM foto_reporte f WHERE f.reporte_id = r.id) AS fotos,
    (SELECT titulo FROM ficha fi WHERE fi.id = r.ficha_vista_id) AS ficha_vista
  FROM reporte r JOIN aula a ON a.id = r.aula_id`;

export default {
  async fetch(request, env, ctx): Promise<Response> {
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

    const rechazo = desdeOtroSitio(request, url);
    if (rechazo) return rechazo;

    try {
      const sesion = await obtenerSesion(request, url, env);
      if (url.pathname === "/api/sesion") {
        return sesion ? json({ ...sesion, monitorea: puedeMonitorear(sesion, env) }) : json({ error: "No autorizado", access: accessConfigurado(env) }, 401);
      }
      if (!sesion) return json({ error: "No autorizado" }, 401);

      // El reporte semanal (Apps Script) entra con un service token y solo puede leer esto
      if (url.pathname === "/api/resumen-semanal" && request.method === "GET" && (sesion.rol === "ti" || sesion.rol === "servicio")) {
        return await resumenSemanal(url, env);
      }
      if (sesion.rol === "servicio") return json({ error: "Este acceso solo sirve para el resumen semanal" }, 403);

      if (url.pathname === "/api/qr" || url.pathname.startsWith("/api/qr/")) return await enrutarQr(request, url, env, sesion, ctx);

      // Daños y mantenimiento: TI atiende los equipos tecnológicos; COA, el local (ver shared/danos.ts)
      if (url.pathname === "/api/danos" || url.pathname.startsWith("/api/danos/")) {
        if (!puedeVerDanos(sesion)) return json({ error: "Solo TI y COA pueden ver los daños" }, 403);
        return await enrutarDanos(request, url, env, sesion);
      }
      // Monitoreo de los laboratorios ML: una tarea personal de quien hace las rondas
      if (url.pathname === "/api/monitoreo" || url.pathname.startsWith("/api/monitoreo/")) {
        // COA mira las fotos de las rondas desde el Historial; todo lo demás es de quien hace las rondas
        const verFoto = request.method === "GET" && /^\/api\/monitoreo\/\d+\/fotos\/\d+$/.test(url.pathname);
        const puede = verFoto ? puedeVerMonitoreo(sesion, env) : puedeMonitorear(sesion, env);
        if (!puede) return json({ error: "El monitoreo de laboratorios es solo de quien hace las rondas" }, 403);
        return await enrutarMonitoreo(request, url, env, sesion);
      }
      // COA ve todo el panel (solo lectura); los avisos al celular son solo de TI
      const soloLee = sesion.rol === "coa" && request.method === "GET" && !url.pathname.startsWith("/api/push");
      // El resto de la API lo cambia solo el área de TI
      if (sesion.rol !== "ti" && !soloLee) return json({ error: "Solo el área de TI puede cambiar esto" }, 403);
      return await enrutar(request, url, env, sesion);
    } catch (err) {
      console.error(err);
      return json({ error: "Error interno" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

async function enrutar(request: Request, url: URL, env: Env, sesion: Sesion): Promise<Response> {
  const { pathname } = url;
  const metodo = request.method;

  if (pathname === "/api/push" || pathname === "/api/push/prueba") return await enrutarPush(request, url, env, sesion);

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
    const [reportes, resumen, eventos] = await env.DB.batch([
      env.DB.prepare(`${SQL_REPORTES} WHERE r.aula_id = ? ORDER BY r.reportado_en DESC LIMIT 200`).bind(id),
      env.DB.prepare(`SELECT COUNT(*) AS total, ${SQL_PROMEDIOS} FROM reporte WHERE aula_id = ?`).bind(id),
      env.DB.prepare(
        `SELECT e.reporte_id, e.estado, e.email, e.nota, e.en FROM reporte_evento e JOIN reporte r ON r.id = e.reporte_id
         WHERE r.aula_id = ? ORDER BY e.en, e.id`,
      ).bind(id),
    ]);
    return json({ aula, reportes: reportes.results, eventos: eventos.results, resumen: resumen.results[0] });
  }

  if (pathname === "/api/metricas" && metodo === "GET") {
    const dias = Math.min(Math.max(Number(url.searchParams.get("dias")) || 30, 1), 365);
    const desde = `-${dias} days`;
    const filtro = `reportado_en >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)`;
    const [resumen, porTipo, ranking, porEntrada, porDia, porEstado, recurrentes, autosolucion] = await env.DB.batch([
      env.DB.prepare(
        `SELECT COUNT(*) AS total,
                SUM(estado <> 'resuelto') AS abiertos,
                SUM(bloquea_clase) AS bloqueantes,
                SUM(escalado_en IS NOT NULL) AS escalados, -- escaladas a GLPI alguna vez, aunque ya estén resueltas
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
         GROUP BY a.id ORDER BY n DESC, a.codigo LIMIT 5`,
      ).bind(desde),
      // Los reportes anteriores a la columna entrada: los de TI llegaron por WhatsApp y los del docente por el QR impreso
      env.DB.prepare(
        `SELECT COALESCE(entrada, CASE WHEN origen = 'whatsapp' THEN 'whatsapp' ELSE 'qr' END) AS entrada, COUNT(*) AS n
         FROM reporte WHERE ${filtro} GROUP BY 1 ORDER BY n DESC`,
      ).bind(desde),
      // Por día de Lima (UTC-5, sin horario de verano)
      env.DB.prepare(
        `SELECT date(reportado_en, '-5 hours') AS dia, COUNT(*) AS n FROM reporte WHERE ${filtro} GROUP BY 1 ORDER BY 1`,
      ).bind(desde),
      env.DB.prepare(
        `SELECT CASE WHEN estado IN ('resuelto', 'escalado') THEN estado ELSE 'pendiente' END AS estado, COUNT(*) AS n
         FROM reporte WHERE ${filtro} GROUP BY 1`,
      ).bind(desde),
      // La misma falla 3 veces o más en un aula: candidata a mantenimiento o cambio de equipo.
      // Las causas registradas dicen si es el mismo desperfecto que vuelve o problemas distintos
      env.DB.prepare(
        `SELECT a.id, a.codigo, a.nombre, r.tipo_falla, COUNT(*) AS n, MAX(r.reportado_en) AS ultima,
                SUM(TRIM(COALESCE(r.causa, '')) <> '') AS con_causa,
                json_group_array(DISTINCT TRIM(r.causa)) FILTER (WHERE TRIM(COALESCE(r.causa, '')) <> '') AS causas
         FROM reporte r JOIN aula a ON a.id = r.aula_id
         WHERE r.${filtro}
         GROUP BY a.id, r.tipo_falla HAVING COUNT(*) >= 3 ORDER BY n DESC, ultima DESC LIMIT 8`,
      ).bind(desde),
      env.DB.prepare(
        `SELECT (SELECT COUNT(*) FROM autosolucion WHERE en >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?1)) AS resueltas,
                (SELECT COUNT(*) FROM reporte WHERE ficha_vista_id IS NOT NULL AND ${filtro.replace("?", "?1")}) AS avisaron`,
      ).bind(desde),
    ]);
    return json({
      dias,
      resumen: resumen.results[0],
      por_tipo: porTipo.results,
      por_entrada: porEntrada.results,
      ranking_aulas: ranking.results,
      por_dia: porDia.results,
      por_estado: porEstado.results,
      recurrentes: (recurrentes.results as (Omit<Recurrente, "causas"> & { causas: string | null })[]).map((r) => ({
        ...r,
        causas: JSON.parse(r.causas ?? "[]") as string[],
      })),
      autosolucion: autosolucion.results[0],
    });
  }

  if (pathname === "/api/historial" && metodo === "GET") return await historial(url, env, sesion);

  if (pathname === "/api/reportes" && metodo === "GET") {
    const abiertos = url.searchParams.get("estado") === "abiertos";
    const sql = abiertos
      ? `${SQL_REPORTES} WHERE r.estado <> 'resuelto'
         ORDER BY r.bloquea_clase DESC, r.reportado_en ASC`
      : `${SQL_REPORTES} ORDER BY r.reportado_en DESC LIMIT 100`;
    const { results } = await env.DB.prepare(sql).all();
    return json(results);
  }

  // TI registra lo que llega por WhatsApp, en persona o por otro canal. Puede indicar la hora real del reporte y, si ya
  // lo atendió, registrarlo resuelto de una vez para que los tiempos queden bien medidos.
  if (pathname === "/api/reportes" && metodo === "POST") {
    const datos = await request.json<Record<string, unknown>>().catch(() => null);
    const aulaId = Number(datos?.aula_id);
    const tipo = datos?.tipo_falla as TipoFalla;
    if (!Number.isInteger(aulaId) || !TIPOS_FALLA.includes(tipo)) {
      return json({ error: "Faltan el aula o el tipo de falla" }, 400);
    }
    // Estado con el que TI lo registra. `resuelto: true` es la forma anterior de pedir "resuelto".
    const estado: EstadoReporte = ESTADOS.includes(datos?.estado as EstadoReporte)
      ? (datos!.estado as EstadoReporte)
      : datos?.resuelto === true
        ? "resuelto"
        : "abierto";
    const ahora = new Date().toISOString();
    const reportadoEn = datos?.reportado_en == null ? ahora : fecha(datos.reportado_en);
    // En atención y resuelto necesitan la hora de llegada al aula; en escalado es opcional
    const conLlegada = estado === "en_atencion" || estado === "resuelto" || (estado === "escalado" && datos?.atendido_en != null);
    const atendidoEn = conLlegada ? fecha(datos?.atendido_en ?? ahora) : null;
    const resueltoEn = estado === "resuelto" ? fecha(datos?.resuelto_en ?? ahora) : null;
    const escaladoEn = estado === "escalado" ? ahora : null;
    if (!reportadoEn || (conLlegada && !atendidoEn) || (estado === "resuelto" && !resueltoEn)) {
      return json({ error: "Alguna fecha no es válida o está en el futuro" }, 400);
    }
    const horas = [reportadoEn, atendidoEn, resueltoEn ?? escaladoEn].filter((h): h is string => h != null);
    if (horas.some((h, i) => i > 0 && h < horas[i - 1])) {
      return json({ error: "Las horas deben ir en orden: reporte, llegada al aula, resuelto" }, 400);
    }
    const ticket = estado === "escalado" ? texto(datos?.ticket_glpi)?.slice(0, 40) ?? null : null;
    const entradaTi = ENTRADAS_TI.includes(datos?.entrada as EntradaTi) ? (datos!.entrada as EntradaTi) : "whatsapp";
    const conCausa = estado === "resuelto" || estado === "escalado";
    const creado = await env.DB.prepare(
      `INSERT INTO reporte (aula_id, tipo_falla, bloquea_clase, descripcion, reportado_por_nombre, origen, entrada,
         reportado_en, estado, atendido_en, resuelto_en, escalado_en, ticket_glpi, causa, notas_resolucion, observaciones, registrado_por)
       VALUES (?, ?, ?, ?, ?, 'whatsapp', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
      .bind(
        aulaId,
        tipo,
        datos?.bloquea_clase ? 1 : 0,
        texto(datos?.descripcion),
        texto(datos?.reportado_por_nombre),
        entradaTi,
        reportadoEn,
        estado,
        atendidoEn,
        resueltoEn,
        escaladoEn,
        ticket,
        conCausa ? texto(datos?.causa) : null,
        estado === "resuelto" ? texto(datos?.notas_resolucion) : null,
        estado === "resuelto" ? null : texto(datos?.observaciones),
        sesion.email,
      )
      .first<{ id: number }>();
    // Historial: cada paso con su hora real
    const pasos: [EstadoReporte, string, string | null][] = [["abierto", reportadoEn, null]];
    if (atendidoEn) pasos.push(["en_atencion", atendidoEn, null]);
    if (escaladoEn) pasos.push(["escalado", escaladoEn, ticket && `GLPI #${ticket}`]);
    if (resueltoEn) pasos.push(["resuelto", resueltoEn, null]);
    await env.DB.batch(
      pasos.map(([e, en, nota]) =>
        env.DB.prepare("INSERT INTO reporte_evento (reporte_id, estado, email, nota, en) VALUES (?, ?, ?, ?, ?)").bind(
          creado!.id,
          e,
          sesion.email,
          nota,
          en,
        ),
      ),
    );
    await avisarCambio(env, aulaId);
    return json(creado, 201);
  }

  // Al atender un reporte: cómo se resolvieron antes fallas parecidas (primero en la misma aula)
  // y las fichas de ese tipo de falla. Así se aprovecha el historial incluso antes del asistente.
  const similares = pathname.match(/^\/api\/reportes\/(\d+)\/similares$/);
  if (similares && metodo === "GET") {
    const reporte = await env.DB.prepare(
      "SELECT id, aula_id, tipo_falla, descripcion, observaciones, causa FROM reporte WHERE id = ?",
    )
      .bind(Number(similares[1]))
      .first<{
        id: number;
        aula_id: number;
        tipo_falla: TipoFalla;
        descripcion: string | null;
        observaciones: string | null;
        causa: string | null;
      }>();
    if (!reporte) return json({ error: "Reporte no encontrado" }, 404);
    const [candidatos, fichas] = await env.DB.batch([
      env.DB.prepare(
        `${SQL_REPORTES}
         WHERE r.tipo_falla = ? AND r.estado = 'resuelto' AND r.id <> ?
           AND (r.notas_resolucion IS NOT NULL OR r.causa IS NOT NULL)
         ORDER BY r.aula_id = ? DESC, r.resuelto_en DESC LIMIT 80`,
      ).bind(reporte.tipo_falla, reporte.id, reporte.aula_id),
      env.DB.prepare("SELECT * FROM ficha WHERE tipo_falla = ? ORDER BY titulo COLLATE NOCASE").bind(reporte.tipo_falla),
    ]);
    const casos = candidatos.results as unknown as Reporte[];
    const buscado = raices(`${reporte.descripcion ?? ""} ${reporte.observaciones ?? ""}`);

    // Sin detalle no hay con qué comparar: se muestran los últimos de la misma falla, primero los de esta aula
    if (buscado.size === 0) {
      const respuesta: Similares = {
        criterio: "tipo",
        casos: casos.slice(0, 3).map((c) => ({ ...c, coincide: [], relevancia: null })),
        fichas: (fichas.results as unknown as Ficha[]).slice(0, 3).map((f) => ({ ...f, coincide: [], relevancia: null })),
      };
      return json(respuesta);
    }
    // Con detalle, solo los que comparten síntomas con lo que se reportó (si no, no se muestran).
    // Entre esos, la relevancia pesa síntomas 45, misma causa 20 y misma aula 10. El tipo de falla no suma:
    // todos los candidatos ya son del mismo tipo. La causa solo cuenta si este reporte ya tiene diagnóstico;
    // si no, se reparte entre lo demás para no castigar a los reportes nuevos
    const causaBuscada = raices(reporte.causa);
    const conCausa = causaBuscada.size > 0;
    const pesoTotal = 45 + 10 + (conCausa ? 20 : 0);
    const redondear = (n: number) => Math.round(n * 100) / 100;
    const casosRelevantes = casos
      .map((c, orden) => {
        const sintomas = comparar(buscado, `${c.descripcion ?? ""} ${c.observaciones ?? ""} ${c.causa ?? ""} ${c.notas_resolucion ?? ""}`);
        const causa = conCausa ? comparar(causaBuscada, c.causa).fraccion : 0;
        const puntos = 45 * sintomas.fraccion + 20 * causa + 10 * Number(c.aula_id === reporte.aula_id);
        return { ...c, coincide: sintomas.palabras, relevancia: redondear(puntos / pesoTotal), orden };
      })
      .filter((c) => c.coincide.length > 0)
      .sort((a, b) => b.relevancia - a.relevancia || a.orden - b.orden)
      .slice(0, 4)
      .map(({ orden: _, ...c }) => c);
    const fichasRelevantes = (fichas.results as unknown as Ficha[])
      .map((f) => {
        const sintomas = comparar(buscado, `${f.titulo} ${f.sintomas ?? ""} ${f.causas_posibles ?? ""}`);
        return { ...f, coincide: sintomas.palabras, relevancia: redondear(sintomas.fraccion) };
      })
      .filter((f) => f.coincide.length > 0)
      .sort((a, b) => b.relevancia - a.relevancia)
      .slice(0, 3);
    const respuesta: Similares = { criterio: "texto", casos: casosRelevantes, fichas: fichasRelevantes };
    return json(respuesta);
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
        // Sin copia en el navegador: si otra persona usa el mismo equipo, la foto se vuelve a pedir con su permiso
        "Cache-Control": "no-store",
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
    const valores = [
      tipo,
      titulo,
      texto(datos?.sintomas),
      texto(datos?.causas_posibles),
      texto(datos?.pasos_docente),
      texto(datos?.pasos_ti),
      texto(datos?.cuando_llamar_ti),
    ];
    if (metodo === "POST" && !ficha[1]) {
      const creada = await env.DB.prepare(
        `INSERT INTO ficha (tipo_falla, titulo, sintomas, causas_posibles, pasos_docente, pasos_ti, cuando_llamar_ti)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      )
        .bind(...valores)
        .first<{ id: number }>();
      return json(creada, 201);
    }
    if (metodo === "PUT" && ficha[1]) {
      const cambiada = await env.DB.prepare(
        `UPDATE ficha SET tipo_falla = ?, titulo = ?, sintomas = ?, causas_posibles = ?, pasos_docente = ?, pasos_ti = ?,
           cuando_llamar_ti = ?,
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
    let nota: string | null = null;
    if (estado === "en_atencion") {
      sentencia = env.DB.prepare(
        `UPDATE reporte SET estado = 'en_atencion',
           atendido_en = COALESCE(atendido_en, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE id = ? AND estado = 'abierto' RETURNING aula_id`,
      ).bind(id);
    } else if (estado === "escalado") {
      // Se deriva a GLPI: sigue abierto para el aula, pero ya no depende solo de TI de la sede
      const ticket = texto(datos?.ticket_glpi)?.slice(0, 40) ?? null;
      nota = ticket && `GLPI #${ticket}`;
      sentencia = env.DB.prepare(
        `UPDATE reporte SET estado = 'escalado',
           atendido_en = COALESCE(atendido_en, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
           escalado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           ticket_glpi = ?,
           observaciones = COALESCE(?, observaciones)
         WHERE id = ? AND estado IN ('abierto', 'en_atencion') RETURNING aula_id`,
      ).bind(ticket, texto(datos?.observaciones), id);
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
    await env.DB.prepare("INSERT INTO reporte_evento (reporte_id, estado, email, nota) VALUES (?, ?, ?, ?)")
      .bind(id, estado, sesion.email, nota)
      .run();
    await avisarCambio(env, fila.aula_id);
    return json({ ok: true });
  }

  return json({ error: "Ruta no encontrada" }, 404);
}

// Reportes y daños recientes del docente: los abiertos y los resueltos de los últimos 7 días
const ESTADO_DOCENTE: Record<string, EstadoMiReporte> = {
  abierto: "recibido",
  pendiente: "recibido",
  en_atencion: "en_atencion",
  en_proceso: "en_atencion",
  escalado: "escalado",
  resuelto: "resuelto",
};

async function misReportes(env: Env, email: string, aulaId?: number): Promise<MiReporte[]> {
  const { results } = await env.DB.prepare(
    `SELECT m.*, a.codigo, a.nombre, a.equipo FROM (
       SELECT 'reporte' AS clase, r.id, r.tipo_falla AS tipo, r.estado, r.reportado_en, r.resuelto_en, r.aula_id
       FROM reporte r JOIN profesor p ON p.id = r.profesor_id WHERE p.email = ?1
       UNION ALL
       SELECT 'dano', d.id, d.tipo, d.estado, d.reportado_en, d.resuelto_en, d.aula_id FROM dano d WHERE d.reportado_por = ?1
     ) m JOIN aula a ON a.id = m.aula_id
     WHERE (m.estado <> 'resuelto' OR m.resuelto_en >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days'))
       AND (?2 IS NULL OR m.aula_id = ?2)
     ORDER BY m.reportado_en DESC LIMIT 8`,
  )
    .bind(email, aulaId ?? null)
    .all<{ clase: "reporte" | "dano"; id: number; tipo: string; estado: string; reportado_en: string; resuelto_en: string | null; codigo: string; nombre: string; equipo: AulaConEstado["equipo"] }>();
  return results.map((m) => ({
    clase: m.clase,
    id: m.id,
    tipo: m.tipo,
    titulo: m.clase === "reporte" ? etiquetaFalla(m.tipo as TipoFalla, m.equipo) : (TIPOS_DANO[m.tipo as TipoDano]?.etiqueta ?? "Daño"),
    aula_codigo: m.codigo,
    aula_nombre: m.nombre,
    estado: ESTADO_DOCENTE[m.estado] ?? "recibido",
    reportado_en: m.reportado_en,
    resuelto_en: m.resuelto_en,
  }));
}

// Rutas del QR: las usa el docente desde su celular (y TI para probar)
async function enrutarQr(request: Request, url: URL, env: Env, sesion: Sesion, ctx: ExecutionContext): Promise<Response> {
  // Lista de aulas para el inicio del docente, por si no puede escanear el QR
  if (url.pathname === "/api/qr" && request.method === "GET") {
    const { results } = await env.DB.prepare(`${SQL_AULAS} GROUP BY a.id ORDER BY a.piso, a.codigo`).all<AulaConEstado>();
    const respuesta: AulasDocente = { aulas: results, email: sesion.email, mios: await misReportes(env, sesion.email) };
    return json(respuesta);
  }
  const coincide = url.pathname.match(/^\/api\/qr\/([\w-]+)(\/reportes(?:\/(\d+)\/foto)?|\/autosolucion|\/danos(?:\/(\d+)\/foto)?)?$/);
  if (!coincide) return json({ error: "Ruta no encontrada" }, 404);
  const codigo = coincide[1];

  const aula = await env.DB.prepare(`${SQL_AULAS} AND a.codigo = ? GROUP BY a.id`)
    .bind(codigo)
    .first<AulaConEstado>();
  if (!aula) return json({ error: "Este QR no corresponde a ninguna aula activa" }, 404);

  if (!coincide[2] && request.method === "GET") {
    const [abiertos, esperas, guias] = await env.DB.batch([
      env.DB.prepare(
        `SELECT id, tipo_falla, bloquea_clase, estado, reportado_en FROM reporte
         WHERE aula_id = ? AND estado <> 'resuelto' ORDER BY reportado_en`,
      ).bind(aula.id),
      env.DB.prepare(
        `SELECT (julianday(atendido_en) - julianday(reportado_en)) * 1440 AS min
         FROM reporte
         WHERE bloquea_clase = 1 AND atendido_en IS NOT NULL
           AND reportado_en >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-90 days')`,
      ),
      // Solo los pasos que TI escribió para el docente; el procedimiento de TI no sale de la Base de conocimiento
      env.DB.prepare(
        `SELECT id, tipo_falla, titulo, pasos_docente, cuando_llamar_ti FROM ficha
         WHERE TRIM(COALESCE(pasos_docente, '')) <> '' ORDER BY tipo_falla, titulo`,
      ),
    ]);
    const estado: EstadoAulaQr = {
      aula,
      mios: await misReportes(env, sesion.email, aula.id),
      abiertos: abiertos.results as EstadoAulaQr["abiertos"],
      espera_urgente_min: mediana((esperas.results as { min: number }[]).map((r) => r.min)),
      email: sesion.email,
      guias: (guias.results as (Omit<GuiaDocente, "pasos"> & { pasos_docente: string })[]).map(({ pasos_docente, ...g }) => ({
        ...g,
        titulo: paraAmbiente(g.titulo, aula),
        cuando_llamar_ti: g.cuando_llamar_ti && paraAmbiente(g.cuando_llamar_ti, aula),
        pasos: pasos_docente.split("\n").map((p) => paraAmbiente(p.trim(), aula)).filter(Boolean),
      })),
    };
    return json(estado);
  }

  // Daños: los de equipos tecnológicos le llegan a TI como push; los del local, solo a COA
  if (coincide[2]?.startsWith("/danos")) {
    if (!coincide[4] && request.method === "POST") {
      const datos = await request.json<Record<string, unknown>>().catch(() => null);
      // La sección del estudiante es la del aula: no se puede escribir otra desde el QR
      const secciones = seccionesDe(aula.seccion);
      if (datos && secciones.length && !secciones.includes(String(datos.seccion ?? ""))) datos.seccion = secciones[0];
      return crearDano(env, aula.id, datos, sesion.email, avisarDanoTi(env, url.origin, ctx));
    }
    if (coincide[4] && request.method === "PUT") {
      // Solo quien lo reportó, en los 15 minutos siguientes
      const propio = await env.DB.prepare(
        `SELECT id FROM dano WHERE id = ? AND aula_id = ? AND reportado_por = ?
           AND reportado_en >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-15 minutes')`,
      )
        .bind(Number(coincide[4]), aula.id, sesion.email)
        .first();
      if (!propio) return json({ error: "No se puede agregar una foto a este daño" }, 403);
      return guardarFotoDano(request, env, Number(coincide[4]));
    }
    return json({ error: "Ruta no encontrada" }, 404);
  }

  // "Ya funciona" después de probar los pasos de una ficha: queda registrado y TI no recibe reporte
  if (coincide[2] === "/autosolucion" && request.method === "POST") {
    const datos = await request.json<Record<string, unknown>>().catch(() => null);
    const ficha = await env.DB.prepare("SELECT id, tipo_falla FROM ficha WHERE id = ?")
      .bind(Number(datos?.ficha_id))
      .first<{ id: number; tipo_falla: TipoFalla }>();
    if (!ficha) return json({ error: "No se encontró la guía que probaste" }, 400);
    await env.DB.prepare("INSERT INTO autosolucion (aula_id, ficha_id, tipo_falla, email) VALUES (?, ?, ?, ?)")
      .bind(aula.id, ficha.id, ficha.tipo_falla, sesion.email)
      .run();
    return json({ ok: true }, 201);
  }
  if (coincide[2] === "/autosolucion") return json({ error: "Ruta no encontrada" }, 404);

  if (coincide[3] && request.method === "PUT") {
    return subirFoto(request, env, sesion, aula.id, Number(coincide[3]));
  }

  if (coincide[2] && !coincide[3] && request.method === "POST") {
    const datos = await request.json<Record<string, unknown>>().catch(() => null);
    const tipo = datos?.tipo_falla as TipoFalla;
    if (!fallasDe(aula).includes(tipo)) return json({ error: "Elige el tipo de falla" }, 400);

    // Evita reportes duplicados de la misma falla mientras siga abierta. Si el docente explica
    // en qué es diferente (otra PC del aula, por ejemplo), se acepta como un reporte nuevo
    const repetido = await env.DB.prepare(
      `SELECT id FROM reporte WHERE aula_id = ? AND tipo_falla = ? AND estado <> 'resuelto' LIMIT 1`,
    )
      .bind(aula.id, tipo)
      .first();
    if (repetido && !texto(datos?.descripcion)) {
      return json({ error: "Esta falla ya está reportada. Si es otra, cuenta en qué es diferente." }, 409);
    }

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
    // Ficha cuyos pasos vio antes de avisar (solo si es del mismo tipo de falla)
    const fichaVista = datos?.ficha_vista_id
      ? await env.DB.prepare("SELECT id, titulo FROM ficha WHERE id = ? AND tipo_falla = ?")
          .bind(Number(datos.ficha_vista_id), tipo)
          .first<{ id: number; titulo: string }>()
      : null;
    const creado = await env.DB.prepare(
      `INSERT INTO reporte (aula_id, profesor_id, reportado_por_nombre, tipo_falla, bloquea_clase, descripcion, origen, entrada, registrado_por, ficha_vista_id)
       VALUES (?, ?, ?, ?, ?, ?, 'qr', ?, ?, ?) RETURNING id, reportado_en`,
    )
      .bind(aula.id, profesor.id, sesion.email, tipo, datos?.bloquea_clase ? 1 : 0, texto(datos?.descripcion), entrada, sesion.email, fichaVista?.id ?? null)
      .first<{ id: number; reportado_en: string }>();
    if (creado) {
      await env.DB.prepare("INSERT INTO reporte_evento (reporte_id, estado, email, en) VALUES (?, 'abierto', ?, ?)")
        .bind(creado.id, sesion.email, creado.reportado_en)
        .run();
    }
    await avisarCambio(env, aula.id);
    // El push sale después de responder, para que el docente no espere a los servicios push
    if (creado) {
      const bloquea = Boolean(datos?.bloquea_clase);
      ctx.waitUntil(
        notificarTi(env, url.origin, {
          titulo: `${bloquea ? "Urgente · " : ""}${aula.nombre}${aula.seccion ? ` (${aula.seccion})` : ""}: ${etiquetaFalla(tipo, aula.equipo)}`,
          cuerpo: [
            bloquea ? "No puede continuar la clase." : null,
            texto(datos?.descripcion),
            fichaVista ? `Ya vio los pasos de "${fichaVista.titulo}"` : null,
            `Reporta ${sesion.email.split("@")[0]}`,
          ]
            .filter(Boolean)
            .join("\n"),
          url: `/aula/${aula.id}`,
          tag: `reporte-${creado.id}`,
          urgente: bloquea,
        }),
      );
    }
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


function clavesVapid(env: Env, origen: string): ClavesVapid | null {
  if (!env.VAPID_PUBLICA || !env.VAPID_PRIVADA) return null;
  return { publica: env.VAPID_PUBLICA.trim(), privada: env.VAPID_PRIVADA.trim(), contacto: origen };
}

// Suscripciones del navegador de TI: GET da la clave pública, POST guarda, DELETE borra
async function enrutarPush(request: Request, url: URL, env: Env, sesion: Sesion): Promise<Response> {
  const claves = clavesVapid(env, url.origin);
  if (url.pathname === "/api/push" && request.method === "GET") {
    return json({ clave: claves?.publica ?? null });
  }
  if (!claves) return json({ error: "Faltan las claves de notificaciones en el servidor" }, 503);

  if (url.pathname === "/api/push/prueba" && request.method === "POST") {
    // Con endpoint, la prueba va solo a ese equipo: sirve para saber si este navegador recibe los avisos
    const { endpoint } = (await request.json<{ endpoint?: unknown }>().catch(() => null)) ?? {};
    const { results } = await env.DB.prepare(`SELECT endpoint, p256dh, auth FROM suscripcion_push WHERE email = ?`)
      .bind(sesion.email)
      .all<SuscripcionPush>();
    const destino = typeof endpoint === "string" ? results.filter((s) => s.endpoint === endpoint) : results;
    const enviados = await enviarATodos(env, destino, claves, {
      titulo: "Notificaciones activadas",
      cuerpo: "Así te avisaremos cada vez que un docente reporte una falla.",
      url: "/dashboard",
      tag: "prueba",
    });
    return json({ enviados });
  }

  const datos = await request.json<Record<string, unknown>>().catch(() => null);
  const endpoint = typeof datos?.endpoint === "string" ? datos.endpoint : "";
  if (!/^https:\/\/[^\s]{1,1000}$/.test(endpoint)) return json({ error: "Suscripción inválida" }, 400);

  if (url.pathname === "/api/push" && request.method === "POST") {
    if (!servicioPushConocido(endpoint)) return json({ error: "Suscripción inválida" }, 400);
    const llaves = datos?.keys as Record<string, unknown> | undefined;
    const p256dh = typeof llaves?.p256dh === "string" ? llaves.p256dh : "";
    const auth = typeof llaves?.auth === "string" ? llaves.auth : "";
    if (!/^[\w-]{80,100}$/.test(p256dh) || !/^[\w-]{16,30}$/.test(auth)) return json({ error: "Suscripción inválida" }, 400);
    await env.DB.prepare(
      `INSERT INTO suscripcion_push (email, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET email = excluded.email, p256dh = excluded.p256dh, auth = excluded.auth`,
    )
      .bind(sesion.email, endpoint, p256dh, auth)
      .run();
    return json({ ok: true }, 201);
  }
  // Cada quien borra solo sus suscripciones, aunque sean de un servicio que ya no se acepta
  if (url.pathname === "/api/push" && request.method === "DELETE") {
    await env.DB.prepare(`DELETE FROM suscripcion_push WHERE endpoint = ? AND email = ?`).bind(endpoint, sesion.email).run();
    return json({ ok: true });
  }
  return json({ error: "Ruta no encontrada" }, 404);
}

interface AvisoPush {
  titulo: string;
  cuerpo: string;
  url: string;
  tag: string;
  urgente?: boolean;
  pendientes?: number; // reportes y daños tecnológicos sin resolver, para el número en el ícono de la app (public/sw.js)
}

// Daño de un equipo tecnológico reportado desde el QR: le llega a TI como push
function avisarDanoTi(env: Env, origen: string, ctx: ExecutionContext): AlCrearDano {
  return ({ id, aulaId, tipo, email }) => {
    ctx.waitUntil(
      (async () => {
        const aula = await env.DB.prepare("SELECT nombre, seccion FROM aula WHERE id = ?")
          .bind(aulaId)
          .first<{ nombre: string; seccion: string | null }>();
        await notificarTi(env, origen, {
          titulo: `Daño · ${aula?.nombre ?? "Aula"}${aula?.seccion ? ` (${aula.seccion})` : ""}: ${TIPOS_DANO[tipo].etiqueta}`,
          cuerpo: `Reporta ${email.split("@")[0]}. ${EQUIPO_DANOS} también lo ve.`,
          url: "/danos",
          tag: `dano-${id}`,
        });
      })().catch((e) => console.error("push daño", e)),
    );
  };
}

// Avisa a todos los navegadores de TI suscritos. Un fallo en uno no detiene a los demás.
async function notificarTi(env: Env, origen: string, aviso: AvisoPush) {
  const claves = clavesVapid(env, origen);
  if (!claves) return;
  const [subs, pendientes] = await env.DB.batch([
    env.DB.prepare(`SELECT email, endpoint, p256dh, auth FROM suscripcion_push`),
    // Lo mismo que cuenta src/usePendientes.ts para TI: reportes y daños de equipos tecnológicos sin resolver
    env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM reporte WHERE estado <> 'resuelto')
            + (SELECT COUNT(*) FROM dano WHERE grupo = 'tecnologia' AND estado <> 'resuelto') AS n`,
    ),
  ]);
  const destinos = (subs.results as (SuscripcionPush & { email: string })[]).filter((s) => sigueEnTi(s.email, env));
  const n = (pendientes.results[0] as { n: number } | undefined)?.n;
  await enviarATodos(env, destinos, claves, { ...aviso, pendientes: n });
}

async function enviarATodos(env: Env, todas: SuscripcionPush[], claves: ClavesVapid, aviso: AvisoPush): Promise<number> {
  // Suscripciones guardadas antes de exigir un servicio push conocido: no reciben nada
  const subs = todas.filter((s) => servicioPushConocido(s.endpoint));
  if (subs.length < todas.length) console.error("push: se omitieron", todas.length - subs.length, "suscripciones de servicios no admitidos");
  const estados = await Promise.all(
    subs.map((s) =>
      enviarPush(s, aviso, claves).catch((e) => {
        console.error("push", e);
        return 0;
      }),
    ),
  );
  // 404 y 410: el navegador anuló el permiso o la suscripción venció
  const vencidas = subs.filter((_, i) => estados[i] === 404 || estados[i] === 410);
  if (vencidas.length) {
    await env.DB.batch(vencidas.map((s) => env.DB.prepare(`DELETE FROM suscripcion_push WHERE endpoint = ?`).bind(s.endpoint)));
  }
  for (const [i, estado] of estados.entries()) {
    if (estado && (estado < 200 || estado >= 300) && estado !== 404 && estado !== 410) console.error("push", estado, new URL(subs[i].endpoint).host);
  }
  return estados.filter((e) => e >= 200 && e < 300).length;
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

// Historial: todos los reportes y daños de un mes (de Lima), con el resumen del Observatorio de ese mes.
// ?mes=2026-10; ?mes=todo trae todo lo guardado. Por defecto, el mes actual
const MAX_HISTORIAL = 5000;
async function historial(url: URL, env: Env, sesion: Sesion): Promise<Response> {
  const conMonitoreo = puedeVerMonitoreo(sesion, env);
  const pedido = url.searchParams.get("mes");
  const todo = pedido === "todo";
  const hoyLima = new Date(Date.now() - 5 * 3_600_000);
  const actual = hoyLima.toISOString().slice(0, 7);
  const mes = todo ? null : /^\d{4}-(0[1-9]|1[0-2])$/.test(pedido ?? "") ? pedido! : actual;
  // El mes en Lima (UTC-5) expresado en UTC: del día 1 a las 5:00 al día 1 del mes siguiente a las 5:00
  let inicio = "0000";
  let fin = "9999";
  if (mes) {
    const [a, m] = mes.split("-").map(Number);
    inicio = new Date(Date.UTC(a, m - 1, 1, 5)).toISOString();
    fin = new Date(Date.UTC(a, m, 1, 5)).toISOString();
  }
  const [meses, resumen, reportes, danos, rondas, aulasMl] = await env.DB.batch([
    env.DB.prepare(
      `SELECT mes, SUM(fallas) AS fallas, SUM(danos) AS danos, SUM(rondas) AS rondas FROM (
         SELECT strftime('%Y-%m', reportado_en, '-5 hours') AS mes, 1 AS fallas, 0 AS danos, 0 AS rondas FROM reporte
         UNION ALL
         SELECT strftime('%Y-%m', reportado_en, '-5 hours'), 0, 1, 0 FROM dano
         ${conMonitoreo ? `UNION ALL SELECT strftime('%Y-%m', inicio, '-5 hours'), 0, 0, 1 FROM monitoreo WHERE fin IS NOT NULL` : ""})
       GROUP BY mes ORDER BY mes DESC`,
    ),
    env.DB.prepare(
      `SELECT COUNT(*) AS total,
              SUM(estado <> 'resuelto') AS abiertos,
              SUM(bloquea_clase) AS bloqueantes,
              SUM(escalado_en IS NOT NULL) AS escalados,
              ${SQL_PROMEDIOS}
       FROM reporte WHERE reportado_en >= ?1 AND reportado_en < ?2`,
    ).bind(inicio, fin),
    env.DB.prepare(
      `${SQL_REPORTES} WHERE r.reportado_en >= ?1 AND r.reportado_en < ?2 ORDER BY r.reportado_en DESC LIMIT ${MAX_HISTORIAL}`,
    ).bind(inicio, fin),
    env.DB.prepare(
      `${SQL_DANOS} WHERE d.reportado_en >= ?1 AND d.reportado_en < ?2 ORDER BY d.reportado_en DESC LIMIT ${MAX_HISTORIAL}`,
    ).bind(inicio, fin),
    ...(conMonitoreo
      ? [
          env.DB.prepare(
            `${SQL_MONITOREO} WHERE m.fin IS NOT NULL AND m.inicio >= ?1 AND m.inicio < ?2 ORDER BY m.inicio DESC LIMIT ${MAX_HISTORIAL}`,
          ).bind(inicio, fin),
          env.DB.prepare(`${SQL_AULAS_ML} ORDER BY piso DESC, codigo`),
        ]
      : []),
  ]);
  const listaMeses = meses.results as Historial["meses"];
  // El mes actual siempre aparece, aunque todavía no tenga nada
  if (!listaMeses.some((m) => m.mes === actual)) listaMeses.unshift({ mes: actual, fallas: 0, danos: 0, rondas: 0 });
  if (!conMonitoreo) for (const m of listaMeses) delete m.rondas;
  const datos: Historial = {
    mes,
    meses: listaMeses,
    resumen: resumen.results[0] as Historial["resumen"],
    reportes: reportes.results as Historial["reportes"],
    danos: danos.results as Historial["danos"],
  };
  if (rondas && aulasMl) {
    const labs = agruparLaboratorios(aulasMl.results as Parameters<typeof agruparLaboratorios>[0]);
    const lista = (rondas.results as FilaRonda[]).map((f) => leerRonda(f, labs));
    const minutos = lista.reduce((s, r) => s + (new Date(r.fin!).getTime() - new Date(r.inicio).getTime()) / 60000, 0);
    datos.monitoreo = { rondas: lista, minutos: Math.round(minutos) };
  }
  return json(datos);
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

// Lo que el docente puede esperar: la mediana, para que un reporte atendido horas después no la infle.
// Con menos de 5 urgentes atendidos aún no es un dato confiable y no se muestra
const MIN_PARA_ESPERA = 5;
function mediana(valores: number[]): number | null {
  if (valores.length < MIN_PARA_ESPERA) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}

// no-store: las respuestas de la API traen datos de reportes y docentes que no deben quedar en caché
function json(datos: unknown, status = 200) {
  return Response.json(datos, { status, headers: { "Cache-Control": "no-store" } });
}

// Contra CSRF: una página de otro sitio que visite alguien de TI no puede usar su sesión de Access
// para cambiar datos ni para abrir el WebSocket. Los navegadores mandan Origin en POST, PUT, PATCH,
// DELETE y WebSockets; los clientes fuera del navegador no lo mandan y no llevan la cookie de Access.
// Además, los cambios con cuerpo de formulario o texto plano (los únicos que otro sitio puede enviar
// sin permiso del navegador) se rechazan: la API solo recibe JSON y fotos.
// Los avisos solo salen hacia los servicios push de los navegadores (Chrome, Edge, Firefox, Safari)
const SERVICIOS_PUSH = ["fcm.googleapis.com", "push.services.mozilla.com", "notify.windows.com", "push.apple.com"];
function servicioPushConocido(endpoint: string): boolean {
  const host = URL.canParse(endpoint) ? new URL(endpoint).hostname : "";
  return SERVICIOS_PUSH.some((s) => host === s || host.endsWith(`.${s}`));
}

const TIPOS_DE_FORMULARIO = ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data"];
function desdeOtroSitio(request: Request, url: URL): Response | null {
  const websocket = request.headers.get("Upgrade")?.toLowerCase() === "websocket";
  const cambia = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (!websocket && !cambia) return null;
  const origen = request.headers.get("Origin");
  const sitio = request.headers.get("Sec-Fetch-Site");
  if ((origen && origen !== url.origin) || (!origen && sitio && sitio !== "same-origin" && sitio !== "none")) {
    return json({ error: "Petición de otro sitio" }, 403);
  }
  const tipo = (request.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
  if (cambia && TIPOS_DE_FORMULARIO.includes(tipo)) return json({ error: "Se esperaba JSON" }, 415);
  return null;
}
