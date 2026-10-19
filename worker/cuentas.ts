// API de Cuentas y plataformas (ver shared/cuentas.ts). Lo registra TI; COA lo ve desde el Historial.
import { ACCIONES_CUENTA, PERSONAS, PLATAFORMAS, paraQuien, resumenAtencion, type AtencionCuenta } from "../shared/cuentas";
import type { Sesion } from "../shared/tipos";
import type { Env } from "./index";

export const SQL_CUENTAS = `SELECT id, accion, plataforma, persona, cantidad, detalle, nota, origen, email, creado_en FROM atencion_cuenta`;
const ORIGENES = ["whatsapp", "presencial", "otro"];
// Un error al registrar se puede borrar durante el día; después ya cuenta para los reportes
const HORAS_PARA_BORRAR = 12;

const texto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export async function enrutarCuentas(request: Request, url: URL, env: Env, sesion: Sesion): Promise<Response> {
  const { pathname } = url;
  const metodo = request.method;

  if (pathname === "/api/cuentas" && metodo === "GET") {
    const [recientes, hoy] = await env.DB.batch([
      env.DB.prepare(`${SQL_CUENTAS} ORDER BY creado_en DESC LIMIT 30`),
      env.DB.prepare(
        `SELECT COUNT(*) AS registros, COALESCE(SUM(cantidad), 0) AS cuentas FROM atencion_cuenta
         WHERE date(creado_en, '-5 hours') = date('now', '-5 hours')`,
      ),
    ]);
    return json({ recientes: recientes.results, hoy: hoy.results[0] });
  }

  if (pathname === "/api/cuentas" && metodo === "POST") {
    const d = await request.json<Record<string, unknown>>().catch(() => null);
    if (!d) return json({ error: "Datos inválidos" }, 400);
    if (typeof d.accion !== "string" || !(d.accion in ACCIONES_CUENTA)) return json({ error: "Elige qué se hizo" }, 400);
    if (typeof d.plataforma !== "string" || !(d.plataforma in PLATAFORMAS)) return json({ error: "Elige la plataforma" }, 400);
    if (typeof d.persona !== "string" || !(d.persona in PERSONAS)) return json({ error: "Elige para quién fue" }, 400);
    const cantidad = d.cantidad == null ? 1 : Number(d.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 200) return json({ error: "La cantidad va de 1 a 200" }, 400);
    const origen = typeof d.origen === "string" && ORIGENES.includes(d.origen) ? d.origen : "presencial";
    const fila = await env.DB.prepare(
      `INSERT INTO atencion_cuenta (accion, plataforma, persona, cantidad, detalle, nota, origen, email)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, accion, plataforma, persona, cantidad, detalle, nota, origen, email, creado_en`,
    )
      .bind(d.accion, d.plataforma, d.persona, cantidad, texto(d.detalle, 120), texto(d.nota, 500), origen, sesion.email)
      .first<AtencionCuenta>();
    return json(fila, 201);
  }

  const una = pathname.match(/^\/api\/cuentas\/(\d+)$/);
  if (una && metodo === "DELETE") {
    const borrada = await env.DB.prepare(
      `DELETE FROM atencion_cuenta WHERE id = ? AND email = ? AND creado_en >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${HORAS_PARA_BORRAR} hours')
       RETURNING id`,
    )
      .bind(Number(una[1]), sesion.email)
      .first();
    if (!borrada) return json({ error: `Solo puedes borrar lo que registraste en las últimas ${HORAS_PARA_BORRAR} horas` }, 404);
    return json({ ok: true });
  }
  return json({ error: "Ruta no encontrada" }, 404);
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
    por_plataforma: [...porPlataforma.values()].sort((a, b) => b.cuentas - a.cuentas),
    detalle: results.map((a) => ({
      creado_en: a.creado_en,
      que: resumenAtencion(a),
      para: paraQuien(a),
      detalle: a.detalle,
      nota: a.nota,
    })),
  };
}

function json(datos: unknown, status = 200) {
  return Response.json(datos, { status, headers: { "Cache-Control": "no-store" } });
}
