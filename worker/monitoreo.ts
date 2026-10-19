import { HALLAZGOS, minutosMonitoreo, type DatosMonitoreo, type Hallazgo, type Laboratorio, type Monitoreo } from "../shared/monitoreo";
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
export const SQL_MONITOREO = `SELECT m.id, m.aula_id, a.piso, m.email, m.inicio, m.fin, m.hallazgos, m.nota,
    (SELECT COUNT(*) FROM foto_monitoreo f WHERE f.monitoreo_id = m.id) AS fotos
  FROM monitoreo m JOIN aula a ON a.id = m.aula_id`;
const MAX_FOTOS = 6;
// La foto de la mañana es antes de la 1 p. m. de Lima; la de la tarde, desde la 1 p. m.
export const HORA_TARDE = 13;
// Las aulas ML son las que tienen "ML" en la sección (Aula 306 · ML/10B)
export const SQL_AULAS_ML = `SELECT id, nombre, seccion, piso FROM aula WHERE activa = 1 AND seccion LIKE 'ML%'`;
const ORDEN_AULAS_ML = "ORDER BY piso DESC, codigo";

// Las aulas ML de cada piso forman un solo laboratorio: "Aula 306" y "Aula 307" → "306 y 307"
export function agruparLaboratorios(aulas: { id: number; nombre: string; piso: number | null }[]): Laboratorio[] {
  const porPiso = new Map<number | null, { id: number; nombres: string[] }>();
  for (const a of aulas) {
    const grupo = porPiso.get(a.piso) ?? { id: a.id, nombres: [] };
    grupo.nombres.push(a.nombre.replace(/^Aula\s+/i, ""));
    porPiso.set(a.piso, grupo);
  }
  return [...porPiso].map(([piso, g]) => ({
    aula_id: g.id,
    piso,
    aulas: g.nombres.length > 1 ? `${g.nombres.slice(0, -1).join(", ")} y ${g.nombres.at(-1)}` : g.nombres[0],
  }));
}

export type Fila = Omit<Monitoreo, "hallazgos" | "aulas"> & { hallazgos: string };
export const leer = (f: Fila, labs: Laboratorio[]): Monitoreo => ({
  ...f,
  aulas: labs.find((l) => l.piso === f.piso)?.aulas ?? "",
  hallazgos: JSON.parse(f.hallazgos) as Hallazgo[],
});

export async function enrutarMonitoreo(request: Request, url: URL, env: Env, sesion: Sesion): Promise<Response> {
  const { pathname } = url;
  const metodo = request.method;
  const email = sesion.email;

  if (pathname === "/api/monitoreo" && metodo === "GET") {
    const [aulas, activos, recientes, semana, fotosHoy] = await env.DB.batch([
      env.DB.prepare(`${SQL_AULAS_ML} ${ORDEN_AULAS_ML}`),
      env.DB.prepare(`${SQL_MONITOREO} WHERE m.email = ? AND m.fin IS NULL ORDER BY a.piso DESC`).bind(email),
      env.DB.prepare(`${SQL_MONITOREO} WHERE m.email = ? AND m.fin IS NOT NULL ORDER BY m.inicio DESC LIMIT 200`).bind(email),
      // Rondas terminadas de los últimos 7 días; el día se cuenta en hora de Lima
      env.DB.prepare(
        `SELECT email, inicio, fin, hallazgos, date(inicio, '-5 hours') = date('now', '-5 hours') AS es_hoy
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
    const semanales = semana.results as { email: string; inicio: string; fin: string; hallazgos: string; es_hoy: number }[];
    const deHoy = semanales.filter((r) => r.es_hoy);
    const labs = agruparLaboratorios(aulas.results as Parameters<typeof agruparLaboratorios>[0]);
    const datos: DatosMonitoreo = {
      laboratorios: labs,
      activos: (activos.results as Fila[]).map((f) => leer(f, labs)),
      recientes: (recientes.results as Fila[]).map((f) => leer(f, labs)),
      hoy: { rondas: deHoy.length, minutos: minutosMonitoreo(deHoy) },
      semana: {
        rondas: semanales.length,
        minutos: minutosMonitoreo(semanales),
        con_hallazgos: semanales.filter((r) => r.hallazgos !== "[]").length,
      },
      fotos_hoy: fotosHoy.results as DatosMonitoreo["fotos_hoy"],
    };
    return json(datos);
  }

  // Empezar una ronda. Se puede estar en los dos pisos a la vez: hay a lo más una ronda abierta por
  // laboratorio, y si ya había una en ese piso se devuelve esa. "cerrar" termina ahora otra ronda abierta
  // (al pasar de un piso al otro).
  if (pathname === "/api/monitoreo" && metodo === "POST") {
    const datos = await request.json<{ aula_id?: unknown; cerrar?: unknown }>().catch(() => null);
    const aulaId = Number(datos?.aula_id);
    const aula = Number.isInteger(aulaId)
      ? await env.DB.prepare(`${SQL_AULAS_ML} AND id = ?`).bind(aulaId).first<{ piso: number | null }>()
      : null;
    if (!aula) return json({ error: "Elige uno de los laboratorios ML" }, 400);
    const abierta = await env.DB.prepare(
      `SELECT m.id FROM monitoreo m JOIN aula a ON a.id = m.aula_id WHERE m.email = ? AND m.fin IS NULL AND a.piso IS ?`,
    )
      .bind(email, aula.piso)
      .first<{ id: number }>();
    if (abierta) return json(await unaRonda(env, abierta.id));
    const cerrar = Number(datos?.cerrar);
    // Cualquier aula del laboratorio sirve: la ronda es del piso
    const nuevo = await env.DB.batch([
      ...(Number.isInteger(cerrar)
        ? [env.DB.prepare(`UPDATE monitoreo SET fin = ${AHORA} WHERE id = ? AND email = ? AND fin IS NULL`).bind(cerrar, email)]
        : []),
      env.DB.prepare(`INSERT INTO monitoreo (aula_id, email, inicio) VALUES (?, ?, ${AHORA}) RETURNING id`).bind(aulaId, email),
    ]);
    const id = (nuevo.at(-1)!.results[0] as { id: number }).id;
    return json(await unaRonda(env, id), 201);
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
    return json(await unaRonda(env, id));
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

// Para el correo del viernes (/api/resumen-semanal): las rondas terminadas entre inicio y fin (UTC),
// con el tiempo por laboratorio, las fotos de mañana y tarde de cada día y lo que se encontró
export async function monitoreoSemanal(env: Env, inicio: string, fin: string): Promise<MonitoreoSemanal> {
  const [aulas, rondas, fotos] = await env.DB.batch([
    env.DB.prepare(`${SQL_AULAS_ML} ${ORDEN_AULAS_ML}`),
    env.DB.prepare(`${SQL_MONITOREO} WHERE m.fin IS NOT NULL AND m.inicio >= ? AND m.inicio < ? ORDER BY m.inicio`).bind(inicio, fin),
    env.DB.prepare(
      `SELECT f.creado_en, a.piso FROM foto_monitoreo f JOIN monitoreo m ON m.id = f.monitoreo_id JOIN aula a ON a.id = m.aula_id
       WHERE f.creado_en >= ? AND f.creado_en < ?`,
    ).bind(inicio, fin),
  ]);
  const labs = agruparLaboratorios(aulas.results as Parameters<typeof agruparLaboratorios>[0]);
  const lista = (rondas.results as Fila[]).map((f) => leer(f, labs));
  const lima = (iso: string) => new Date(new Date(iso).getTime() - 5 * 3_600_000);
  const minutos = (r: Monitoreo) => Math.round((new Date(r.fin!).getTime() - new Date(r.inicio).getTime()) / 60000);

  // Todos los laboratorios, también los que no tuvieron rondas: el correo arma la tabla de fotos con ellos
  const porLab = new Map(labs.map((l) => [l.piso, { piso: l.piso, aulas: l.aulas, rondas: 0, minutos: 0 }]));
  const porDia = new Map<string, MonitoreoSemanal["dias"][number]>();
  const delDia = (dia: string, piso: number | null) => {
    const clave = `${dia}|${piso}`;
    if (!porDia.has(clave)) {
      porDia.set(clave, { dia, piso, aulas: labs.find((l) => l.piso === piso)?.aulas ?? "", rondas: 0, minutos: 0, fotos_manana: 0, fotos_tarde: 0 });
    }
    return porDia.get(clave)!;
  };
  for (const r of lista) {
    const lab = porLab.get(r.piso) ?? { piso: r.piso, aulas: r.aulas, rondas: 0, minutos: 0 };
    lab.rondas++;
    lab.minutos += minutos(r);
    porLab.set(r.piso, lab);
    const d = delDia(lima(r.inicio).toISOString().slice(0, 10), r.piso);
    d.rondas++;
    d.minutos += minutos(r);
  }
  for (const f of fotos.results as { creado_en: string; piso: number | null }[]) {
    const t = lima(f.creado_en);
    const d = delDia(t.toISOString().slice(0, 10), f.piso);
    if (t.getUTCHours() < HORA_TARDE) d.fotos_manana++;
    else d.fotos_tarde++;
  }

  return {
    rondas: lista.length,
    minutos: minutosMonitoreo(lista), // el rato en los dos pisos a la vez cuenta una vez
    con_hallazgos: lista.filter((r) => r.hallazgos.length).length,
    laboratorios: [...porLab.values()],
    dias: [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia) || (b.piso ?? 0) - (a.piso ?? 0)),
    novedades: lista
      .filter((r) => r.hallazgos.length || r.nota)
      .map((r) => ({ inicio: r.inicio, piso: r.piso, aulas: r.aulas, hallazgos: r.hallazgos.map((h) => HALLAZGOS[h]), nota: r.nota })),
  };
}

export interface MonitoreoSemanal {
  rondas: number;
  minutos: number; // tiempo real: menos que la suma de los laboratorios si estuvo en los dos a la vez
  con_hallazgos: number;
  laboratorios: { piso: number | null; aulas: string; rondas: number; minutos: number }[]; // todos, del piso más alto al más bajo
  // Un registro por día y piso con rondas o fotos (día en hora de Lima, AAAA-MM-DD)
  dias: { dia: string; piso: number | null; aulas: string; rondas: number; minutos: number; fotos_manana: number; fotos_tarde: number }[];
  novedades: { inicio: string; piso: number | null; aulas: string; hallazgos: string[]; nota: string | null }[];
}

async function unaRonda(env: Env, id: number): Promise<Monitoreo> {
  const [aulas, fila] = await env.DB.batch([
    env.DB.prepare(`${SQL_AULAS_ML} ${ORDEN_AULAS_ML}`),
    env.DB.prepare(`${SQL_MONITOREO} WHERE m.id = ?`).bind(id),
  ]);
  return leer(fila.results[0] as Fila, agruparLaboratorios(aulas.results as Parameters<typeof agruparLaboratorios>[0]));
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
