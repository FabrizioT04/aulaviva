// API de Cuentas y plataformas (ver shared/cuentas.ts). Lo registra TI; COA lo ve desde el Historial.
// El docente también puede pedirlo desde el QR de un ML (pedido_cuenta): TI lo atiende desde Registrar.
import { ACCIONES_CUENTA, cuentaDelPedido, PERSONAS, PLATAFORMAS, paraQuien, resumenAtencion, type AtencionCuenta, type PedidoCuenta } from "../shared/cuentas";
import type { Sesion } from "../shared/tipos";
import type { Env } from "./index";
import { sede } from "./sede-en-vivo";

export const SQL_CUENTAS = `SELECT id, accion, plataforma, persona, cantidad, detalle, nota, origen, email, creado_en, pedido_id FROM atencion_cuenta`;
export const SQL_PEDIDOS = `SELECT id, accion, plataforma, para, cantidad, detalle, descripcion, email, estado, creado_en, resuelto_en, aula_id,
  (SELECT nombre FROM aula WHERE aula.id = pedido_cuenta.aula_id) AS aula_nombre FROM pedido_cuenta`;
const ORIGENES = ["whatsapp", "presencial", "otro"];
// Un error al registrar se puede borrar durante el día; después ya cuenta para los reportes
const HORAS_PARA_BORRAR = 12;
// Pedidos de un mismo docente esperando a TI: más que esto suele ser un error o una lista para WhatsApp
const MAX_PEDIDOS_PENDIENTES = 5;
const AHORA = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

const texto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export async function enrutarCuentas(request: Request, url: URL, env: Env, sesion: Sesion): Promise<Response> {
  const { pathname } = url;
  const metodo = request.method;

  if (pathname === "/api/cuentas" && metodo === "GET") {
    const [recientes, hoy, pedidos] = await env.DB.batch([
      env.DB.prepare(`${SQL_CUENTAS} ORDER BY creado_en DESC LIMIT 30`),
      env.DB.prepare(
        `SELECT COUNT(*) AS registros, COALESCE(SUM(cantidad), 0) AS cuentas FROM atencion_cuenta
         WHERE date(creado_en, '-5 hours') = date('now', '-5 hours')`,
      ),
      env.DB.prepare(`${SQL_PEDIDOS} WHERE estado = 'pendiente' ORDER BY creado_en`),
    ]);
    return json({ recientes: recientes.results, hoy: hoy.results[0], pedidos: pedidos.results });
  }

  // Para el número en la pestaña Registrar (src/usePendientes.ts)
  if (pathname === "/api/cuentas/pedidos" && metodo === "GET") {
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM pedido_cuenta WHERE estado = 'pendiente'`).first<number>("n");
    return json({ pendientes: n ?? 0 });
  }

  if (pathname === "/api/cuentas" && metodo === "POST") {
    const d = await request.json<Record<string, unknown>>().catch(() => null);
    if (!d) return json({ error: "Datos inválidos" }, 400);
    if (typeof d.accion !== "string" || !(d.accion in ACCIONES_CUENTA)) return json({ error: "Elige qué se hizo" }, 400);
    if (typeof d.plataforma !== "string" || !(d.plataforma in PLATAFORMAS)) return json({ error: "Elige la plataforma" }, 400);
    if (typeof d.persona !== "string" || !(d.persona in PERSONAS)) return json({ error: "Elige para quién fue" }, 400);
    const cantidad = d.cantidad == null ? 1 : Number(d.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 200) return json({ error: "La cantidad va de 1 a 200" }, 400);
    // Atender un pedido del docente lo cierra; si otro de TI ya lo cerró, no se registra dos veces
    const pedidoId = d.pedido_id == null ? null : Number(d.pedido_id);
    // Lo que vino de un pedido llegó por AulaViva: el Historial lo muestra así, sin importar el origen
    const origen = pedidoId !== null ? "otro" : typeof d.origen === "string" && ORIGENES.includes(d.origen) ? d.origen : "presencial";
    if (pedidoId !== null) {
      if (!Number.isInteger(pedidoId)) return json({ error: "Datos inválidos" }, 400);
      const tomado = await env.DB.prepare(
        `UPDATE pedido_cuenta SET estado = 'resuelto', resuelto_en = ${AHORA} WHERE id = ? AND estado = 'pendiente' RETURNING id`,
      )
        .bind(pedidoId)
        .first();
      if (!tomado) return json({ error: "Ese pedido ya fue atendido" }, 409);
    }
    const fila = await env.DB.prepare(
      `INSERT INTO atencion_cuenta (accion, plataforma, persona, cantidad, detalle, nota, origen, email, pedido_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, accion, plataforma, persona, cantidad, detalle, nota, origen, email, creado_en, pedido_id`,
    )
      .bind(d.accion, d.plataforma, d.persona, cantidad, texto(d.detalle, 300), texto(d.nota, 500), origen, sesion.email, pedidoId)
      .first<AtencionCuenta>()
      .catch(async (e) => {
        if (pedidoId !== null) await reabrir(env, pedidoId);
        throw e;
      });
    if (pedidoId !== null) await sede(env).difundir({ tipo: "cuentas" });
    return json(fila, 201);
  }

  const una = pathname.match(/^\/api\/cuentas\/(\d+)$/);
  if (una && metodo === "DELETE") {
    const borrada = await env.DB.prepare(
      `DELETE FROM atencion_cuenta WHERE id = ? AND email = ? AND creado_en >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${HORAS_PARA_BORRAR} hours')
       RETURNING id, pedido_id`,
    )
      .bind(Number(una[1]), sesion.email)
      .first<{ id: number; pedido_id: number | null }>();
    if (!borrada) return json({ error: `Solo puedes borrar lo que registraste en las últimas ${HORAS_PARA_BORRAR} horas` }, 404);
    // Si atendía un pedido del docente, el pedido vuelve a quedar pendiente
    if (borrada.pedido_id !== null) {
      await reabrir(env, borrada.pedido_id);
      await sede(env).difundir({ tipo: "cuentas" });
    }
    return json({ ok: true });
  }
  return json({ error: "Ruta no encontrada" }, 404);
}

const reabrir = (env: Env, id: number) =>
  env.DB.prepare(`UPDATE pedido_cuenta SET estado = 'pendiente', resuelto_en = NULL WHERE id = ?`).bind(id).run();

// POST /api/qr/:codigo/cuentas: desde un ML, el docente pide ayuda con la cuenta de un estudiante o la suya.
// Nunca se piden claves.
export async function crearPedido(
  request: Request,
  env: Env,
  email: string,
  aula: { id: number; nombre: string },
  alCrear: (p: PedidoCuenta) => void,
): Promise<Response> {
  const d = await request.json<Record<string, unknown>>().catch(() => null);
  if (!d) return json({ error: "Datos inválidos" }, 400);
  if (typeof d.accion !== "string" || !(d.accion in ACCIONES_CUENTA)) return json({ error: "Elige qué problema tienes" }, 400);
  if (typeof d.plataforma !== "string" || !(d.plataforma in PLATAFORMAS)) return json({ error: "Elige la plataforma" }, 400);
  if (d.para !== "yo" && d.para !== "estudiante") return json({ error: "Elige de quién es la cuenta" }, 400);
  const detalle = d.para === "estudiante" ? texto(d.detalle, 300) : null;
  if (d.para === "estudiante" && !detalle) return json({ error: "Escribe la sección y el nombre del estudiante" }, 400);
  const cantidad = d.para === "estudiante" && d.cantidad != null ? Number(d.cantidad) : 1;
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 60) return json({ error: "Los estudiantes van de 1 a 60" }, 400);
  const descripcion = texto(d.descripcion, 500);
  if (!descripcion && (d.accion === "otro" || d.plataforma === "otra")) return json({ error: "Cuéntale a TI qué pasa" }, 400);

  const [repetido, pendientes] = await env.DB.batch([
    env.DB.prepare(
      `${SQL_PEDIDOS} WHERE email = ? AND estado = 'pendiente' AND accion = ? AND plataforma = ? AND para = ? AND COALESCE(detalle, '') = ?`,
    ).bind(email, d.accion, d.plataforma, d.para, detalle ?? ""),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM pedido_cuenta WHERE email = ? AND estado = 'pendiente'`).bind(email),
  ]);
  // Tocó Enviar dos veces, o lo vuelve a pedir: TI ya tiene ese pedido
  const ya = repetido.results[0] as PedidoCuenta | undefined;
  if (ya) return json({ ...ya, ya_enviado: true });
  if (((pendientes.results[0] as { n: number }).n ?? 0) >= MAX_PEDIDOS_PENDIENTES)
    return json({ error: `Ya tienes ${MAX_PEDIDOS_PENDIENTES} pedidos esperando a TI. Espera a que los atiendan, o escríbele a TI.` }, 429);

  const fila = await env.DB.prepare(
    `INSERT INTO pedido_cuenta (accion, plataforma, para, cantidad, detalle, descripcion, email, aula_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id, accion, plataforma, para, cantidad, detalle, descripcion, email, estado, creado_en, resuelto_en, aula_id`,
  )
    .bind(d.accion, d.plataforma, d.para, cantidad, detalle, descripcion, email, aula.id)
    .first<Omit<PedidoCuenta, "aula_nombre">>();
  if (!fila) return json({ error: "No se pudo guardar. Intenta de nuevo." }, 500);
  const pedido: PedidoCuenta = { ...fila, aula_nombre: aula.nombre };
  await sede(env).difundir({ tipo: "cuentas" });
  alCrear(pedido);
  return json(pedido, 201);
}

// Para "Tus reportes" del docente: los pendientes y los resueltos de los últimos 7 días (de un aula, en su QR)
export async function pedidosDe(env: Env, email: string, aulaId?: number): Promise<PedidoCuenta[]> {
  const { results } = await env.DB.prepare(
    `${SQL_PEDIDOS} WHERE email = ?1 AND (estado = 'pendiente' OR resuelto_en >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days'))
       AND (?2 IS NULL OR aula_id = ?2)
     ORDER BY creado_en DESC LIMIT 8`,
  )
    .bind(email, aulaId ?? null)
    .all<PedidoCuenta>();
  return results;
}

// Para el correo del viernes (/api/resumen-semanal): lo atendido entre inicio y fin (UTC), con las etiquetas listas
export async function cuentasSemanal(env: Env, inicio: string, fin: string) {
  const { results } = await env.DB.prepare(`${SQL_CUENTAS} WHERE creado_en >= ? AND creado_en < ? ORDER BY creado_en`)
    .bind(inicio, fin)
    .all<AtencionCuenta>();
  const porPlataforma = new Map<string, { plataforma: string; etiqueta: string; registros: number; cuentas: number }>();
  for (const a of results) {
    const p = porPlataforma.get(a.plataforma) ?? { plataforma: a.plataforma, etiqueta: PLATAFORMAS[a.plataforma] ?? a.plataforma, registros: 0, cuentas: 0 };
    p.registros++;
    p.cuentas += a.cantidad;
    porPlataforma.set(a.plataforma, p);
  }
  return {
    registros: results.length,
    cuentas: results.reduce((s, a) => s + a.cantidad, 0),
    claves: results.filter((a) => a.accion === "clave").reduce((s, a) => s + a.cantidad, 0),
    pedidos: results.filter((a) => a.pedido_id !== null).length, // atenciones que el docente pidió desde un ML
    por_plataforma: [...porPlataforma.values()].sort((a, b) => b.cuentas - a.cuentas),
    detalle: results.map((a) => ({
      creado_en: a.creado_en,
      que: resumenAtencion(a),
      para: paraQuien(a),
      detalle: a.detalle,
      nota: a.nota,
      pedido: a.pedido_id !== null,
    })),
  };
}

function json(datos: unknown, status = 200) {
  return Response.json(datos, { status, headers: { "Cache-Control": "no-store" } });
}
