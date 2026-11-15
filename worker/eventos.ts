// API de Eventos externos (ver shared/eventos.ts). TI registra y cambia; COA solo ve.
import { ESTADOS_EVENTO, LISTA_EQUIPOS_EVENTO, TIPOS_EVENTO, type EquipoEvento, type EstadoEvento, type Evento, type TipoEvento } from "../shared/eventos";
import type { Sesion } from "../shared/tipos";
import type { Env } from "./index";
import { sede } from "./sede-en-vivo";

const SQL_EVENTOS = `
  SELECT e.*, a.nombre AS aula_nombre, a.espacio AS aula_espacio
  FROM evento e LEFT JOIN aula a ON a.id = e.aula_id`;

export const puedeVerEventos = (sesion: Sesion) => sesion.rol === "ti" || sesion.rol === "coa";

type FilaEvento = Omit<Evento, "equipos"> & { equipos: string };
const leer = (f: FilaEvento): Evento => {
  let equipos: EquipoEvento[] = [];
  try {
    equipos = (JSON.parse(f.equipos) as string[]).filter((e): e is EquipoEvento => LISTA_EQUIPOS_EVENTO.includes(e as EquipoEvento));
  } catch {
    // equipos vacío
  }
  return { ...f, equipos };
};

export async function enrutarEventos(request: Request, url: URL, env: Env, sesion: Sesion): Promise<Response> {
  const { pathname } = url;
  const metodo = request.method;
  if (metodo !== "GET" && sesion.rol !== "ti") return json({ error: "Solo el área de TI registra los eventos" }, 403);

  // Próximos (programados) en orden de fecha; o los pasados (realizados y cancelados), del más reciente
  if (pathname === "/api/eventos" && metodo === "GET") {
    const pasados = url.searchParams.get("estado") === "pasados";
    const tipo = url.searchParams.get("tipo");
    const { results } = await env.DB.prepare(
      `${SQL_EVENTOS} WHERE ${pasados ? "e.estado <> 'programado'" : "e.estado = 'programado'"}
         AND (?1 IS NULL OR e.tipo = ?1)
       ORDER BY e.inicio ${pasados ? "DESC" : "ASC"} LIMIT 200`,
    )
      .bind(TIPOS_EVENTO.includes(tipo as TipoEvento) ? tipo : null)
      .all<FilaEvento>();
    return json(results.map(leer));
  }

  if (pathname === "/api/eventos" && metodo === "POST") {
    const datos = await request.json<Record<string, unknown>>().catch(() => null);
    const valido = await validar(env, datos);
    if ("error" in valido) return json(valido, 400);
    const v = valido.ok;
    // Lo que ya terminó (por ejemplo, el apoyo de esta tarde) se guarda como Realizado
    const terminado = (v.fin ?? v.inicio) <= new Date().toISOString();
    const creado = await env.DB.prepare(
      `INSERT INTO evento (tipo, nombre, organiza, aula_id, inicio, fin, responsable, contacto, equipos, notas, estado, registrado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
      .bind(v.tipo, v.nombre, v.organiza, v.aula_id, v.inicio, v.fin, v.responsable, v.contacto, JSON.stringify(v.equipos), v.notas, terminado ? "realizado" : "programado", sesion.email)
      .first<{ id: number }>();
    await avisar(env);
    return json({ id: creado?.id }, 201);
  }

  const uno = pathname.match(/^\/api\/eventos\/(\d+)$/);
  if (!uno) return json({ error: "Ruta no encontrada" }, 404);
  const id = Number(uno[1]);
  const existe = await env.DB.prepare("SELECT id FROM evento WHERE id = ?").bind(id).first();
  if (!existe) return json({ error: "Evento no encontrado" }, 404);

  // Cambiar el estado (Realizado, Cancelado o volver a Programado) con una nota opcional
  if (metodo === "PATCH") {
    const datos = await request.json<Record<string, unknown>>().catch(() => null);
    const estado = datos?.estado as EstadoEvento;
    if (!ESTADOS_EVENTO.includes(estado)) return json({ error: "Estado no válido" }, 400);
    await env.DB.prepare("UPDATE evento SET estado = ?1, nota_cierre = ?2, actualizado_por = ?3 WHERE id = ?4")
      .bind(estado, estado === "programado" ? null : texto(datos?.nota_cierre), sesion.email, id)
      .run();
    await avisar(env);
    return json({ ok: true });
  }

  // Editar los datos del evento
  if (metodo === "PUT") {
    const datos = await request.json<Record<string, unknown>>().catch(() => null);
    const valido = await validar(env, datos);
    if ("error" in valido) return json(valido, 400);
    const v = valido.ok;
    await env.DB.prepare(
      `UPDATE evento SET tipo = ?, nombre = ?, organiza = ?, aula_id = ?, inicio = ?, fin = ?, responsable = ?, contacto = ?,
         equipos = ?, notas = ?, actualizado_por = ? WHERE id = ?`,
    )
      .bind(v.tipo, v.nombre, v.organiza, v.aula_id, v.inicio, v.fin, v.responsable, v.contacto, JSON.stringify(v.equipos), v.notas, sesion.email, id)
      .run();
    await avisar(env);
    return json({ ok: true });
  }

  if (metodo === "DELETE") {
    await env.DB.prepare("DELETE FROM evento WHERE id = ?").bind(id).run();
    await avisar(env);
    return json({ ok: true });
  }

  return json({ error: "Ruta no encontrada" }, 404);
}

async function validar(env: Env, datos: Record<string, unknown> | null) {
  const tipo: TipoEvento = datos?.tipo === "apoyo" ? "apoyo" : "externo";
  const externo = tipo === "externo";
  const nombre = texto(datos?.nombre)?.slice(0, 120);
  if (!nombre) return { error: externo ? "Escribe el nombre del evento" : "Escribe qué hiciste" };
  // El lugar es obligatorio en los eventos externos; en el apoyo, solo si se eligió
  const aula = datos?.aula_id
    ? await env.DB.prepare("SELECT id FROM aula WHERE id = ? AND activa = 1").bind(Number(datos.aula_id)).first<{ id: number }>()
    : null;
  if (!aula && (externo || datos?.aula_id)) return { error: "Elige el aula o el patio" };
  const inicio = fecha(datos?.inicio);
  if (!inicio) return { error: "Elige la fecha y hora de inicio" };
  const fin = fecha(datos?.fin);
  if (fin && fin <= inicio) return { error: "La hora de fin debe ser después del inicio" };
  const equipos = externo && Array.isArray(datos?.equipos)
    ? [...new Set((datos.equipos as unknown[]).filter((e): e is EquipoEvento => LISTA_EQUIPOS_EVENTO.includes(e as EquipoEvento)))]
    : [];
  return {
    ok: {
      tipo,
      nombre,
      aula_id: aula?.id ?? null,
      inicio,
      fin,
      equipos,
      organiza: externo ? (texto(datos?.organiza)?.slice(0, 120) ?? null) : null,
      responsable: externo ? (texto(datos?.responsable)?.slice(0, 120) ?? null) : null,
      contacto: externo ? (texto(datos?.contacto)?.slice(0, 120) ?? null) : null,
      notas: texto(datos?.notas),
    },
  };
}

// La pestaña Eventos abierta en otro equipo se actualiza sola
async function avisar(env: Env) {
  await sede(env).difundir({ tipo: "eventos" }).catch((e) => console.error("en vivo eventos", e));
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim().slice(0, 1000) : null;
}

function fecha(valor: unknown): string | null {
  if (typeof valor !== "string" || !valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function json(datos: unknown, status = 200) {
  return Response.json(datos, { status, headers: { "Cache-Control": "no-store" } });
}
