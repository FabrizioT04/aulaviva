import { HALLAZGOS, type DatosMonitoreo, type Hallazgo, type Monitoreo } from "../shared/monitoreo";
import type { Sesion } from "../shared/tipos";
import { MAX_FOTO_BYTES, TIPOS_FOTO } from "./danos";
import type { Env } from "./index";

// Monitoreo de los laboratorios ML (ver shared/monitoreo.ts). Es una tarea personal: lo ven solo los
// correos de MONITOREO_EMAILS; sin esa lista, todo TI. Cada quien ve y cambia solo sus rondas.
export function puedeMonitorear(sesion: Sesion, env: Env): boolean {
  if (sesion.rol !== "ti") return false;
  const lista = (env.MONITOREO_EMAILS ?? "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  return lista.length === 0 || lista.includes(sesion.email);
}

// En el Historial lo ven también COA (solo mirar): las rondas cuentan como trabajo de TI en los laboratorios
export function puedeVerMonitoreo(sesion: Sesion, env: Env): boolean {
  return sesion.rol === "coa" || puedeMonitorear(sesion, env);
}

const AHORA = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;
export const SQL_MONITOREO = `SELECT m.id, m.aula_id, a.nombre AS aula_nombre, a.seccion AS aula_seccion, m.email, m.inicio, m.fin, m.hallazgos, m.nota,
    (SELECT COUNT(*) FROM foto_monitoreo f WHERE f.monitoreo_id = m.id) AS fotos
  FROM monitoreo m JOIN aula a ON a.id = m.aula_id`;
const MAX_FOTOS = 6;
// La foto de la mañana es antes de la 1 p. m. de Lima; la de la tarde, desde la 1 p. m.
export const HORA_TARDE = 13;
// Las aulas ML son las que tienen "ML" en la sección (Aula 306 · ML/10B)
const SQL_AULAS_ML = `SELECT id, nombre, seccion, piso FROM aula WHERE activa = 1 AND seccion LIKE 'ML%'`;
// Minutos de cada ronda terminada; el día se cuenta en hora de Lima
const MINUTOS = `(julianday(fin) - julianday(inicio)) * 1440`;
const HOY = `date(inicio, '-5 hours') = date('now', '-5 hours')`;

type Fila = Omit<Monitoreo, "hallazgos"> & { hallazgos: string };
export const leer = (f: Fila): Monitoreo => ({ ...f, hallazgos: JSON.parse(f.hallazgos) as Hallazgo[] });

export async function enrutarMonitoreo(request: Request, url: URL, env: Env, sesion: Sesion): Promise<Response> {
  const { pathname } = url;
  const metodo = request.method;
  const email = sesion.email;

  if (pathname === "/api/monitoreo" && metodo === "GET") {
    const [aulas, activo, recientes, resumen, fotosHoy] = await env.DB.batch([
      env.DB.prepare(`${SQL_AULAS_ML} ORDER BY piso DESC, codigo`),
      env.DB.prepare(`${SQL_MONITOREO} WHERE m.email = ? AND m.fin IS NULL ORDER BY m.inicio DESC LIMIT 1`).bind(email),
      env.DB.prepare(`${SQL_MONITOREO} WHERE m.email = ? AND m.fin IS NOT NULL ORDER BY m.inicio DESC LIMIT 200`).bind(email),
      env.DB.prepare(
        `SELECT COALESCE(SUM(${HOY}), 0) AS rondas_hoy,
                COALESCE(SUM(CASE WHEN ${HOY} THEN ${MINUTOS} END), 0) AS minutos_hoy,
                COUNT(*) AS rondas, COALESCE(SUM(${MINUTOS}), 0) AS minutos,
                COALESCE(SUM(hallazgos <> '[]'), 0) AS con_hallazgos
         FROM monitoreo WHERE email = ? AND fin IS NOT NULL AND inicio >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')`,
      ).bind(email),
      // Fotos de hoy por piso, separadas en mañana y tarde
      env.DB.prepare(
        `SELECT a.piso,
                SUM(CAST(strftime('%H', f.creado_en, '-5 hours') AS INTEGER) < ${HORA_TARDE}) AS manana,
                SUM(CAST(strftime('%H', f.creado_en, '-5 hours') AS INTEGER) >= ${HORA_TARDE}) AS tarde
         FROM foto_monitoreo f JOIN monitoreo m ON m.id = f.monitoreo_id JOIN aula a ON a.id = m.aula_id
         WHERE m.email = ? AND date(f.creado_en, '-5 hours') = date('now', '-5 hours')
         GROUP BY a.piso`,
      ).bind(email),
    ]);
    const r = resumen.results[0] as Record<string, number>;
    const datos: DatosMonitoreo = {
      aulas: aulas.results as DatosMonitoreo["aulas"],
      activo: activo.results[0] ? leer(activo.results[0] as Fila) : null,
      recientes: (recientes.results as Fila[]).map(leer),
      hoy: { rondas: r.rondas_hoy, minutos: Math.round(r.minutos_hoy) },
      semana: { rondas: r.rondas, minutos: Math.round(r.minutos), con_hallazgos: r.con_hallazgos },
      fotos_hoy: fotosHoy.results as DatosMonitoreo["fotos_hoy"],
    };
    return json(datos);
  }

  // Empezar una ronda. Si había otra abierta (cambió de aula o de piso), esa termina ahora.
  if (pathname === "/api/monitoreo" && metodo === "POST") {
    const datos = await request.json<{ aula_id?: unknown }>().catch(() => null);
    const aulaId = Number(datos?.aula_id);
    const aula = Number.isInteger(aulaId) ? await env.DB.prepare(`${SQL_AULAS_ML} AND id = ?`).bind(aulaId).first() : null;
    if (!aula) return json({ error: "Elige uno de los laboratorios ML" }, 400);
    const [, nuevo] = await env.DB.batch([
      env.DB.prepare(`UPDATE monitoreo SET fin = ${AHORA} WHERE email = ? AND fin IS NULL`).bind(email),
      env.DB.prepare(`INSERT INTO monitoreo (aula_id, email, inicio) VALUES (?, ?, ${AHORA}) RETURNING id`).bind(aulaId, email),
    ]);
    const id = (nuevo.results[0] as { id: number }).id;
    const fila = await env.DB.prepare(`${SQL_MONITOREO} WHERE m.id = ?`).bind(id).first<Fila>();
    return json(leer(fila!), 201);
  }

  const una = pathname.match(/^\/api\/monitoreo\/(\d+)(\/foto|\/fotos\/(\d+))?$/);
  if (!una) return json({ error: "Ruta no encontrada" }, 404);
  const id = Number(una[1]);

  // Ver una foto: también COA, desde el Historial (index.ts deja pasar este GET con puedeVerMonitoreo)
  if (una[3] != null && metodo === "GET") {
    const foto = await env.DB.prepare("SELECT r2_key FROM foto_monitoreo WHERE monitoreo_id = ? ORDER BY id LIMIT 1 OFFSET ?")
      .bind(id, Number(una[3]))
      .first<{ r2_key: string }>();
    const objeto = foto ? await env.FOTOS.get(foto.r2_key) : null;
    if (!objeto) return json({ error: "Esta ronda no tiene esa foto" }, 404);
    return new Response(objeto.body, {
      headers: { "Content-Type": objeto.httpMetadata?.contentType ?? "image/jpeg", "Cache-Control": "no-store" },
    });
  }

  const actual = await env.DB.prepare(`SELECT inicio, fin FROM monitoreo WHERE id = ? AND email = ?`)
    .bind(id, email)
    .first<{ inicio: string; fin: string | null }>();
  if (!actual) return json({ error: "Ronda no encontrada" }, 404);

  if (una[2] === "/foto" && metodo === "PUT") return await guardarFoto(request, env, id);
  if (una[2]) return json({ error: "Ruta no encontrada" }, 404);

  // Lo que encontró y la nota se guardan mientras la ronda sigue; "terminar" pone la hora de fin
  if (metodo === "PATCH") {
    const datos = await request.json<Record<string, unknown>>().catch(() => null);
    if (!datos) return json({ error: "Datos inválidos" }, 400);
    const cambios: string[] = [];
    const valores: unknown[] = [];

    if ("hallazgos" in datos) {
      const lista = datos.hallazgos;
      if (!Array.isArray(lista) || lista.some((h) => typeof h !== "string" || !(h in HALLAZGOS))) {
        return json({ error: "Hallazgo desconocido" }, 400);
      }
      cambios.push("hallazgos = ?");
      valores.push(JSON.stringify([...new Set(lista)]));
    }
    if ("nota" in datos) {
      const nota = typeof datos.nota === "string" ? datos.nota.trim().slice(0, 1000) : "";
      cambios.push("nota = ?");
      valores.push(nota || null);
    }
    if (datos.terminar === true) {
      // Si se olvidó terminar a tiempo, puede decir a qué hora terminó (entre el inicio y ahora)
      if (typeof datos.fin === "string") {
        const fin = new Date(datos.fin);
        if (isNaN(fin.getTime()) || fin <= new Date(actual.inicio) || fin.getTime() > Date.now() + 60_000) {
          return json({ error: "La hora de fin debe estar entre el inicio y ahora" }, 400);
        }
        cambios.push("fin = ?");
        valores.push(fin.toISOString());
      } else if (!actual.fin) {
        cambios.push(`fin = ${AHORA}`);
      }
    }
    if (!cambios.length) return json({ error: "Nada que cambiar" }, 400);
    await env.DB.prepare(`UPDATE monitoreo SET ${cambios.join(", ")} WHERE id = ? AND email = ?`)
      .bind(...valores, id, email)
      .run();
    const fila = await env.DB.prepare(`${SQL_MONITOREO} WHERE m.id = ?`).bind(id).first<Fila>();
    return json(leer(fila!));
  }

  // Descartar una ronda empezada por error (solo mientras sigue abierta)
  if (metodo === "DELETE") {
    if (actual.fin) return json({ error: "Solo se descarta una ronda que no terminó" }, 400);
    const { results: fotos } = await env.DB.prepare("SELECT r2_key FROM foto_monitoreo WHERE monitoreo_id = ?").bind(id).all<{ r2_key: string }>();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM foto_monitoreo WHERE monitoreo_id = ?").bind(id),
      env.DB.prepare(`DELETE FROM monitoreo WHERE id = ? AND email = ?`).bind(id, email),
    ]);
    if (fotos.length) await env.FOTOS.delete(fotos.map((f) => f.r2_key));
    return json({ ok: true });
  }
  return json({ error: "Ruta no encontrada" }, 404);
}

// Fotos de la ronda: hasta 6, ya comprimidas en el celular (src/comprimir.ts)
async function guardarFoto(request: Request, env: Env, monitoreoId: number): Promise<Response> {
  const tipo = (request.headers.get("Content-Type") ?? "").split(";")[0].trim();
  const extension = TIPOS_FOTO[tipo];
  if (!extension) return json({ error: "La foto debe ser JPG, PNG o WebP" }, 415);
  const datos = await request.arrayBuffer();
  if (datos.byteLength === 0 || datos.byteLength > MAX_FOTO_BYTES) {
    return json({ error: "La foto está vacía o es demasiado grande" }, 413);
  }
  const clave = `monitoreo/${monitoreoId}-${crypto.randomUUID()}.${extension}`;
  await env.FOTOS.put(clave, datos, { httpMetadata: { contentType: tipo } });
  const guardada = await env.DB.prepare(
    `INSERT INTO foto_monitoreo (monitoreo_id, r2_key)
     SELECT ?1, ?2 WHERE (SELECT COUNT(*) FROM foto_monitoreo WHERE monitoreo_id = ?1) < ?3
     RETURNING id`,
  )
    .bind(monitoreoId, clave, MAX_FOTOS)
    .first();
  if (!guardada) {
    await env.FOTOS.delete(clave);
    return json({ error: `La ronda ya tiene ${MAX_FOTOS} fotos` }, 409);
  }
  return json({ ok: true }, 201);
}

function json(datos: unknown, status = 200) {
  return Response.json(datos, { status, headers: { "Cache-Control": "no-store" } });
}
