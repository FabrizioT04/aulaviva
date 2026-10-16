// API de Daños y mantenimiento (ver shared/danos.ts).
// TI ve todo; COA y Mantenimiento ven lo de su área. El docente solo puede reportar desde el QR.
import { ETIQUETA_ESTADO_DANO, LISTA_TIPOS_DANO, TIPOS_DANO } from "../shared/danos";
import type { AreaDano, Dano, EstadoDano, TipoDano } from "../shared/danos";
import type { Sesion } from "../shared/tipos";
import type { Env } from "./index";

const SQL_DANOS = `
  SELECT d.*, a.codigo AS aula_codigo, a.nombre AS aula_nombre,
    (SELECT COUNT(*) FROM foto_dano f WHERE f.dano_id = d.id) AS fotos
  FROM dano d JOIN aula a ON a.id = d.aula_id`;

const TIPOS_FOTO: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_FOTO_BYTES = 3 * 1024 * 1024;
const MAX_FOTOS = 3;

// Área que ve cada rol; TI ve las dos
function areaDe(sesion: Sesion): AreaDano | null {
  return sesion.rol === "coa" || sesion.rol === "mantenimiento" ? sesion.rol : null;
}

export const puedeVerDanos = (sesion: Sesion) => sesion.rol === "ti" || areaDe(sesion) !== null;

export async function enrutarDanos(request: Request, url: URL, env: Env, sesion: Sesion): Promise<Response> {
  const { pathname } = url;
  const metodo = request.method;
  const propia = areaDe(sesion);

  if (pathname === "/api/danos" && metodo === "GET") {
    const resueltos = url.searchParams.get("estado") === "resueltos";
    const pedida = url.searchParams.get("area");
    const area = propia ?? (pedida === "coa" || pedida === "mantenimiento" ? pedida : null);
    const { results } = await env.DB.prepare(
      `${SQL_DANOS} WHERE ${resueltos ? "d.estado = 'resuelto'" : "d.estado <> 'resuelto'"}
         AND (?1 IS NULL OR d.area = ?1)
       ORDER BY ${resueltos ? "d.resuelto_en DESC" : "d.reportado_en DESC"} LIMIT 200`,
    )
      .bind(area)
      .all<Dano>();
    return json(results);
  }

  if (pathname === "/api/danos" && metodo === "POST") {
    const datos = await request.json<Record<string, unknown>>().catch(() => null);
    const aula = await env.DB.prepare("SELECT id FROM aula WHERE id = ? AND activa = 1")
      .bind(Number(datos?.aula_id))
      .first<{ id: number }>();
    if (!aula) return json({ error: "Elige el aula o el ambiente" }, 400);
    return crearDano(env, aula.id, datos, sesion.email);
  }

  const uno = pathname.match(/^\/api\/danos\/(\d+)(\/foto|\/fotos\/(\d))?$/);
  if (!uno) return json({ error: "Ruta no encontrada" }, 404);
  const id = Number(uno[1]);
  const dano = await env.DB.prepare("SELECT id, area FROM dano WHERE id = ?").bind(id).first<{ id: number; area: AreaDano }>();
  if (!dano || (propia && dano.area !== propia)) return json({ error: "Daño no encontrado" }, 404);

  if (!uno[2] && metodo === "PATCH") {
    const datos = await request.json<Record<string, unknown>>().catch(() => null);
    const estado = datos?.estado as EstadoDano;
    if (!(estado in ETIQUETA_ESTADO_DANO)) return json({ error: "Estado no válido" }, 400);
    await env.DB.prepare(
      `UPDATE dano SET estado = ?1, actualizado_por = ?2,
         resuelto_en = CASE WHEN ?1 = 'resuelto' THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') END,
         nota_cierre = CASE WHEN ?1 = 'resuelto' THEN ?3 ELSE nota_cierre END
       WHERE id = ?4`,
    )
      .bind(estado, sesion.email, texto(datos?.nota_cierre), id)
      .run();
    return json({ ok: true });
  }

  if (uno[2] === "/foto" && metodo === "PUT") return guardarFoto(request, env, id);

  if (uno[3] != null && metodo === "GET") {
    const foto = await env.DB.prepare("SELECT r2_key FROM foto_dano WHERE dano_id = ? ORDER BY id LIMIT 1 OFFSET ?")
      .bind(id, Number(uno[3]))
      .first<{ r2_key: string }>();
    const objeto = foto ? await env.FOTOS.get(foto.r2_key) : null;
    if (!objeto) return json({ error: "Este daño no tiene esa foto" }, 404);
    return new Response(objeto.body, {
      headers: { "Content-Type": objeto.httpMetadata?.contentType ?? "image/jpeg", "Cache-Control": "private, max-age=3600" },
    });
  }

  return json({ error: "Ruta no encontrada" }, 404);
}

// Lo usan el panel y la página del QR. El área sale del tipo de daño.
export async function crearDano(env: Env, aulaId: number, datos: Record<string, unknown> | null, email: string) {
  const tipo = datos?.tipo as TipoDano;
  if (!LISTA_TIPOS_DANO.includes(tipo)) return json({ error: "Elige qué está dañado" }, 400);
  const area = TIPOS_DANO[tipo].area;
  const chromebook = area === "coa";
  const descripcion = texto(datos?.descripcion);
  if (tipo.endsWith("_otro") && !descripcion) return json({ error: "Cuenta en pocas palabras qué está dañado" }, 400);
  const creado = await env.DB.prepare(
    `INSERT INTO dano (aula_id, area, tipo, equipo, seccion, estudiante, descripcion, reportado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(
      aulaId,
      area,
      tipo,
      chromebook ? texto(datos?.equipo)?.slice(0, 40) ?? null : null,
      chromebook ? texto(datos?.seccion)?.slice(0, 20) ?? null : null,
      chromebook ? texto(datos?.estudiante)?.slice(0, 80) ?? null : null,
      descripcion,
      email,
    )
    .first<{ id: number }>();
  return json(creado, 201);
}

// Fotos de evidencia: hasta 3 por daño
export async function guardarFoto(request: Request, env: Env, danoId: number): Promise<Response> {
  const tipo = (request.headers.get("Content-Type") ?? "").split(";")[0].trim();
  const extension = TIPOS_FOTO[tipo];
  if (!extension) return json({ error: "La foto debe ser JPG, PNG o WebP" }, 415);
  const datos = await request.arrayBuffer();
  if (datos.byteLength === 0 || datos.byteLength > MAX_FOTO_BYTES) {
    return json({ error: "La foto está vacía o es demasiado grande" }, 413);
  }
  const clave = `danos/${danoId}-${crypto.randomUUID()}.${extension}`;
  await env.FOTOS.put(clave, datos, { httpMetadata: { contentType: tipo } });
  const guardada = await env.DB.prepare(
    `INSERT INTO foto_dano (dano_id, r2_key)
     SELECT ?1, ?2 WHERE (SELECT COUNT(*) FROM foto_dano WHERE dano_id = ?1) < ?3
     RETURNING id`,
  )
    .bind(danoId, clave, MAX_FOTOS)
    .first();
  if (!guardada) {
    await env.FOTOS.delete(clave);
    return json({ error: `Ya tiene ${MAX_FOTOS} fotos` }, 409);
  }
  return json({ ok: true }, 201);
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim().slice(0, 1000) : null;
}

function json(datos: unknown, status = 200) {
  return Response.json(datos, { status });
}
