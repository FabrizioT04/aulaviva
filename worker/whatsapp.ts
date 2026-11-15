// Reportes por WhatsApp (WhatsApp Cloud API de Meta, ver docs/whatsapp.md).
//
// El docente le escribe al WhatsApp Business de la sede como siempre. Meta avisa de cada mensaje a
// /api/whatsapp/webhook; Hazio lee el aula y la falla (shared/whatsapp.ts), crea el reporte como Pendiente
// y le responde "Registrado ✅". Si falta algo, pregunta: sugiere la última aula de ese número o pide el número
// o la sección, y muestra una lista para elegir la falla. Si no responde, el mensaje queda en la bandeja
// "Por clasificar" del dashboard.
//
// Costo cero: WhatsApp solo cobra los mensajes de plantilla. Las respuestas dentro de las 24 h desde el último
// mensaje del docente son gratis, y Hazio nunca escribe fuera de esa ventana: si TI resuelve el reporte después,
// se lo cuenta la próxima vez que el docente escriba.
import { fallasDe, etiquetaFalla, TIPOS_FALLA, type AulaConEstado, type EventoEnVivo, type Sesion, type TipoFalla } from "../shared/tipos";
import { aulaEnTexto, esNo, esSi, esUrgente, MINUTOS_RESPUESTA, pareceReporte, tipoEnTexto, type BorradorWhatsapp } from "../shared/whatsapp";
import type { Env } from "./index";
import { sede } from "./sede-en-vivo";

const API_GRAPH = "https://graph.facebook.com/v23.0";
// Margen para no rozar el límite de 24 h de WhatsApp
const VENTANA_MS = 23.5 * 60 * 60 * 1000;
const MAX_FOTOS = 3;
const MAX_FOTO_BYTES = 5 * 1024 * 1024;
const TIPOS_FOTO: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// Lo que index.ts presta a este módulo, para no importarlo de vuelta
export interface Avisos {
  cambioAula: (aulaId: number) => Promise<void>;
  nuevoReporte: (aviso: { id: number; aula: AulaConEstado; tipo: TipoFalla; bloquea: boolean; texto: string | null; quien: string }) => Promise<void>;
}

type Aula = AulaConEstado;
interface Contacto {
  telefono: string;
  nombre: string | null;
  ultimo_mensaje_en: string;
  ultima_aula_id: number | null;
  fotos_sueltas: string;
  email: string | null;
  token_enlace: string | null;
  invitado_en: string | null;
}
interface FilaBorrador {
  id: number;
  telefono: string;
  nombre: string | null;
  texto: string | null;
  aula_id: number | null;
  tipo_falla: TipoFalla | null;
  bloquea_clase: number;
  fotos: string;
  paso: BorradorWhatsapp["paso"];
  intentos: number;
  recibido_en: string;
  actualizado_en: string;
}
interface Borrador extends Omit<FilaBorrador, "fotos"> {
  fotos: string[];
}

// Lo que importa de un mensaje entrante de la Cloud API
export interface MensajeEntrante {
  id: string;
  from: string;
  timestamp?: string;
  type: string;
  text?: { body: string };
  image?: { id: string; caption?: string; mime_type?: string };
  interactive?: { type: string; button_reply?: { id: string }; list_reply?: { id: string } };
}

const ahoraIso = () => new Date().toISOString();
const haceMinutos = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
export const dentroDeVentana = (ultimo: string | null | undefined) => Boolean(ultimo) && Date.now() - Date.parse(ultimo!) < VENTANA_MS;
const nombreAula = (a: Pick<Aula, "nombre" | "seccion">) => `${a.nombre}${a.seccion ? ` (${a.seccion})` : ""}`;
const nombreFalla = (tipo: TipoFalla, a: Pick<Aula, "equipo" | "espacio">) => etiquetaFalla(tipo, a.equipo, a.espacio);
const SQL_AULA = `SELECT id, codigo, nombre, piso, pabellon, nivel, seccion, equipo, espacio, clases, impresora, audio, red_wifi FROM aula`;

// ─── Webhook ───────────────────────────────────────────────────────────────

export async function webhookWhatsapp(request: Request, url: URL, env: Env, ctx: ExecutionContext, avisos: Avisos): Promise<Response> {
  // Meta verifica la dirección una vez, al configurar el webhook
  if (request.method === "GET") {
    const modo = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const reto = url.searchParams.get("hub.challenge") ?? "";
    if (modo === "subscribe" && env.WA_VERIFY_TOKEN && token && iguales(token, env.WA_VERIFY_TOKEN)) {
      return new Response(reto, { headers: { "Content-Type": "text/plain" } });
    }
    return new Response("No autorizado", { status: 403 });
  }
  if (request.method !== "POST") return new Response("Método no permitido", { status: 405 });
  if (!env.WA_APP_SECRET) {
    console.error("whatsapp: falta el secreto WA_APP_SECRET");
    return new Response("No configurado", { status: 503 });
  }
  const cuerpo = await request.text();
  // Solo Meta conoce el App Secret: así nadie más puede crear reportes por esta dirección
  if (!(await firmaValida(cuerpo, request.headers.get("X-Hub-Signature-256"), env.WA_APP_SECRET))) {
    return new Response("Firma no válida", { status: 401 });
  }
  let datos: { entry?: { changes?: { field?: string; value?: { messages?: MensajeEntrante[]; contacts?: { wa_id: string; profile?: { name?: string } }[] } }[] }[] };
  try {
    datos = JSON.parse(cuerpo);
  } catch {
    return new Response("JSON no válido", { status: 400 });
  }
  const pendientes: { mensaje: MensajeEntrante; nombre: string | null }[] = [];
  for (const entrada of datos.entry ?? []) {
    for (const cambio of entrada.changes ?? []) {
      if (cambio.field && cambio.field !== "messages") continue;
      const nombres = new Map((cambio.value?.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? null]));
      for (const mensaje of cambio.value?.messages ?? []) pendientes.push({ mensaje, nombre: nombres.get(mensaje.from) ?? null });
    }
  }
  // Se responde a Meta enseguida (si tarda, reenvía el aviso) y los mensajes se procesan después, en orden
  ctx.waitUntil(
    (async () => {
      for (const { mensaje, nombre } of pendientes) {
        await procesarMensaje(env, mensaje, nombre, avisos, url.origin).catch((e) => console.error("whatsapp: mensaje", e));
      }
    })(),
  );
  return new Response("ok");
}

async function firmaValida(cuerpo: string, cabecera: string | null, secreto: string): Promise<boolean> {
  const recibida = cabecera?.match(/^sha256=([0-9a-f]{64})$/i)?.[1]?.toLowerCase();
  if (!recibida) return false;
  const clave = await crypto.subtle.importKey("raw", new TextEncoder().encode(secreto.trim()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const firma = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(cuerpo));
  const esperada = [...new Uint8Array(firma)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return iguales(recibida, esperada);
}

function iguales(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diferencia = 0;
  for (let i = 0; i < x.length; i++) diferencia |= x[i] ^ y[i];
  return diferencia === 0;
}

// Modo de prueba: con WA_NUMEROS_PRUEBA, Hazio solo atiende esos números y el resto sigue como siempre
function numeroPermitido(env: Env, telefono: string): boolean {
  const lista = (env.WA_NUMEROS_PRUEBA ?? "").split(",").map((n) => n.replace(/\D/g, "")).filter(Boolean);
  return lista.length === 0 || lista.includes(telefono.replace(/\D/g, ""));
}

// ─── Conversación ──────────────────────────────────────────────────────────

export async function procesarMensaje(env: Env, mensaje: MensajeEntrante, nombre: string | null, avisos: Avisos, origen: string): Promise<void> {
  const telefono = mensaje.from;
  if (!telefono || !numeroPermitido(env, telefono)) return;
  // WhatsApp puede avisar dos veces del mismo mensaje
  const nuevo = await env.DB.prepare("INSERT OR IGNORE INTO wa_mensaje (id) VALUES (?) RETURNING id").bind(mensaje.id).first();
  if (!nuevo) return;

  // Cada mensaje del docente abre de nuevo la ventana de 24 h en que Hazio puede responder gratis
  const contacto = (await env.DB.prepare(
    `INSERT INTO wa_contacto (telefono, nombre, ultimo_mensaje_en) VALUES (?, ?, ?)
     ON CONFLICT(telefono) DO UPDATE SET nombre = COALESCE(excluded.nombre, nombre), ultimo_mensaje_en = excluded.ultimo_mensaje_en
     RETURNING *`,
  )
    .bind(telefono, nombre, ahoraIso())
    .first<Contacto>())!;
  await env.DB.prepare("DELETE FROM wa_mensaje WHERE recibido_en < ?").bind(haceMinutos(7 * 24 * 60)).run();

  await contarResueltosPendientes(env, telefono);

  const borrador = await borradorActivo(env, telefono);
  const aulas = (await env.DB.prepare(`${SQL_AULA} WHERE activa = 1 ORDER BY codigo`).all<Aula>()).results;
  const ctx: Conversacion = { env, telefono, contacto, aulas, avisos, origen };

  if (mensaje.type === "interactive") {
    const id = mensaje.interactive?.button_reply?.id ?? mensaje.interactive?.list_reply?.id ?? "";
    if (borrador) await responderBoton(ctx, borrador, id);
    return;
  }

  let texto = mensaje.type === "text" ? (mensaje.text?.body ?? "").trim() : "";
  if (mensaje.type === "image" && mensaje.image?.id) {
    texto = (mensaje.image.caption ?? "").trim();
    const fotoId = mensaje.image.id;
    if (borrador) {
      if (borrador.fotos.length < MAX_FOTOS) borrador.fotos.push(fotoId);
      await guardar(env, borrador);
      if (!texto) return;
    } else if (!pareceReporte(texto)) {
      // Foto de un reporte de hace un rato, o una que llega antes del texto (se guarda por si el reporte llega después)
      if (await agregarAReporteReciente(env, telefono, fotoId, avisos)) return;
      const sueltas = fotosSueltas(contacto).slice(-(MAX_FOTOS - 1));
      sueltas.push({ id: fotoId, en: ahoraIso() });
      await env.DB.prepare("UPDATE wa_contacto SET fotos_sueltas = ? WHERE telefono = ?").bind(JSON.stringify(sueltas), telefono).run();
      return;
    } else {
      // Foto con un reporte en el texto: es un reporte nuevo con su foto
      contacto.fotos_sueltas = JSON.stringify([...fotosSueltas(contacto), { id: fotoId, en: ahoraIso() }]);
    }
  } else if (mensaje.type !== "text") {
    // Audios, stickers, ubicaciones…: solo se contesta si Hazio estaba esperando una respuesta
    if (borrador && mensaje.type === "audio") {
      await enviarTexto(env, telefono, "Todavía no puedo escuchar audios 🙏 ¿Me lo escribes?");
    }
    return;
  }
  if (!texto) return;

  if (borrador) {
    await responderTexto(ctx, borrador, texto);
    return;
  }

  // Sin conversación abierta: solo se toma como reporte si lo parece. Lo demás lo sigue leyendo TI en la app.
  if (!pareceReporte(texto)) return;
  const aula = aulaEnTexto(texto, aulas);
  const fotos = fotosSueltas(contacto)
    .filter((f) => f.en >= haceMinutos(15))
    .map((f) => f.id)
    .slice(-MAX_FOTOS);
  const creado = await env.DB.prepare(
    `INSERT INTO wa_borrador (telefono, nombre, texto, aula_id, tipo_falla, bloquea_clase, fotos) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(telefono, contacto.nombre, texto.slice(0, 1000), aula?.id ?? null, tipoEnTexto(texto), esUrgente(texto) ? 1 : 0, JSON.stringify(fotos))
    .first<FilaBorrador>();
  await env.DB.prepare("UPDATE wa_contacto SET fotos_sueltas = '[]' WHERE telefono = ?").bind(telefono).run();
  await avanzar(ctx, leerBorrador(creado!));
}

interface Conversacion {
  env: Env;
  telefono: string;
  contacto: Contacto;
  aulas: Aula[];
  avisos: Avisos;
  origen: string; // dirección de Hazio, para los enlaces
}

async function responderBoton(ctx: Conversacion, b: Borrador, id: string) {
  if (id === "aula:si" && b.paso === "confirmar_aula" && b.aula_id) {
    b.paso = null;
    return await avanzar(ctx, b);
  }
  if (id === "aula:otra" && (b.paso === "confirmar_aula" || b.paso === "aula")) {
    b.aula_id = null;
    b.paso = "aula";
    return await avanzar(ctx, b);
  }
  const falla = id.match(/^falla:(\w+)$/)?.[1] as TipoFalla | undefined;
  if (falla && b.paso === "falla" && TIPOS_FALLA.includes(falla)) {
    b.tipo_falla = falla;
    b.paso = null;
    return await avanzar(ctx, b);
  }
}

async function responderTexto(ctx: Conversacion, b: Borrador, texto: string) {
  b.texto = [b.texto, texto].filter(Boolean).join("\n").slice(0, 1000);
  if (!b.bloquea_clase && esUrgente(texto)) b.bloquea_clase = 1;
  if (b.paso === "confirmar_aula" || b.paso === "aula") {
    const aula = aulaEnTexto(texto, ctx.aulas);
    b.tipo_falla ??= tipoEnTexto(texto);
    if (aula) {
      b.aula_id = aula.id;
      b.paso = null;
    } else if (b.paso === "confirmar_aula" && esSi(texto)) {
      b.paso = null;
    } else if (b.paso === "confirmar_aula" && esNo(texto)) {
      b.aula_id = null;
      b.paso = "aula";
    } else {
      return await noEntendi(ctx, b, "No encontré esa aula 🤔 Escríbeme solo el número o la sección, por ejemplo 204 o 4A.");
    }
    return await avanzar(ctx, b);
  }
  if (b.paso === "falla") {
    const tipo = tipoEnTexto(texto);
    const aula = ctx.aulas.find((a) => a.id === b.aula_id);
    if (tipo && aula && fallasDe(aula).includes(tipo)) {
      b.tipo_falla = tipo;
      b.paso = null;
      return await avanzar(ctx, b);
    }
    if (tipo === null && /^(otro|otra cosa)\b/i.test(texto.trim())) {
      b.tipo_falla = "otro";
      b.paso = null;
      return await avanzar(ctx, b);
    }
    return await noEntendi(ctx, b, null);
  }
  await guardar(ctx.env, b);
}

// Se vuelve a preguntar una sola vez. Si tampoco se entiende, Hazio se calla y el mensaje queda para TI.
async function noEntendi(ctx: Conversacion, b: Borrador, mensaje: string | null) {
  b.intentos += 1;
  await guardar(ctx.env, b);
  if (b.intentos > 1) return;
  if (b.paso === "falla") return await preguntarFalla(ctx, b);
  await enviarTexto(ctx.env, ctx.telefono, mensaje!);
}

// Pregunta lo que falta o, si ya está todo, registra el reporte
async function avanzar(ctx: Conversacion, b: Borrador) {
  const { env, telefono, contacto } = ctx;
  if (!b.aula_id) {
    const ultima = contacto.ultima_aula_id ? ctx.aulas.find((a) => a.id === contacto.ultima_aula_id) : undefined;
    if (ultima && b.paso !== "aula") {
      b.aula_id = ultima.id;
      b.paso = "confirmar_aula";
      await guardar(env, b);
      return await enviarBotones(env, telefono, `¿Es en ${nombreAula(ultima)}?`, [
        { id: "aula:si", titulo: "Sí" },
        { id: "aula:otra", titulo: "Otra aula" },
      ]);
    }
    const primeraVez = b.paso !== "aula";
    b.paso = "aula";
    await guardar(env, b);
    return await enviarTexto(
      env,
      telefono,
      `${primeraVez ? "Gracias por avisar 🙌 " : ""}¿En qué aula es? Escríbeme el número o la sección, por ejemplo 204 o 4A.`,
    );
  }
  if (b.paso === "confirmar_aula") return await guardar(env, b);
  const aula = ctx.aulas.find((a) => a.id === b.aula_id);
  if (!aula) {
    b.aula_id = null;
    b.paso = "aula";
    return await avanzar(ctx, b);
  }
  if (!b.tipo_falla || !fallasDe(aula).includes(b.tipo_falla)) {
    b.tipo_falla = null;
    b.paso = "falla";
    b.intentos = 0;
    await guardar(env, b);
    return await preguntarFalla(ctx, b);
  }
  b.paso = null;
  const resultado = await registrar(env, b, aula, "whatsapp", ctx.avisos);
  await enviarTexto(env, telefono, mensajeRegistrado(resultado, aula, b.tipo_falla) + (await invitacion(env, telefono, aula, ctx.origen)));
}

async function preguntarFalla(ctx: Conversacion, b: Borrador) {
  const aula = ctx.aulas.find((a) => a.id === b.aula_id)!;
  await enviarLista(
    ctx.env,
    ctx.telefono,
    `¿Qué está fallando en ${nombreAula(aula)}?`,
    "Elegir falla",
    fallasDe(aula).map((t) => ({ id: `falla:${t}`, titulo: nombreFalla(t, aula) })),
  );
}

function mensajeRegistrado(r: { reporteId: number; repetido: string | null }, aula: Aula, tipo: TipoFalla): string {
  const que = `${nombreFalla(tipo, aula)} en ${nombreAula(aula)}`;
  if (r.repetido) {
    return `Ya estaba registrado ✅ ${que}. TI lo tiene desde las ${horaLima(r.repetido)}. Te escribo por aquí cuando quede resuelto.`;
  }
  return `Registrado ✅ ${que}. TI ya lo tiene en el panel. Te escribo por aquí cuando quede resuelto.`;
}

// Invitación a usar Hazio, al pie del "Registrado ✅": el enlace abre el QR de esa aula y, la primera vez,
// une este número con el correo del docente, para que vea en "Tus reportes" lo que avisó por WhatsApp.
// Mientras no lo abra se le recuerda como máximo una vez al día; después, una vez por semana.
export async function invitacion(env: Env, telefono: string, aula: Pick<Aula, "codigo">, origen: string): Promise<string> {
  const contacto = await env.DB.prepare("SELECT email, invitado_en FROM wa_contacto WHERE telefono = ?")
    .bind(telefono)
    .first<Pick<Contacto, "email" | "invitado_en">>();
  if (!contacto) return "";
  const cada = contacto.email ? 7 * 24 * 60 : 20 * 60;
  if (contacto.invitado_en && contacto.invitado_en >= haceMinutos(cada)) return "";
  const nuevo = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const fila = await env.DB.prepare(
    "UPDATE wa_contacto SET token_enlace = COALESCE(token_enlace, ?), invitado_en = ? WHERE telefono = ? RETURNING token_enlace",
  )
    .bind(nuevo, ahoraIso(), telefono)
    .first<{ token_enlace: string }>();
  const enlace = `${origen}/r/${encodeURIComponent(aula.codigo)}?via=enlace&wa=${fila!.token_enlace}`;
  return contacto.email
    ? `\n\n👉 La próxima vez avísalo en 2 toques desde Hazio, sin escribir: ${enlace}`
    : `\n\n👉 Mira en qué va tu reporte y avisa en 2 toques la próxima vez: ${enlace}`;
}

// El docente abrió el enlace de la invitación con su sesión de Hazio: su número queda unido a su correo
export async function vincularTelefono(env: Env, token: string, email: string): Promise<boolean> {
  if (!/^[0-9a-f]{24}$/.test(token)) return false;
  const fila = await env.DB.prepare("UPDATE wa_contacto SET email = ? WHERE token_enlace = ? RETURNING telefono").bind(email, token).first();
  return Boolean(fila);
}

const horaLima = (iso: string) => new Date(iso).toLocaleTimeString("es-PE", { hour: "numeric", minute: "2-digit", timeZone: "America/Lima" });

// ─── Registro del reporte ──────────────────────────────────────────────────

// Crea el reporte (Pendiente, con origen WhatsApp) y cierra el borrador. Si esa falla ya está abierta en el aula,
// no la duplica: el docente queda enlazado para recibir el "Resuelto".
async function registrar(
  env: Env,
  b: Borrador,
  aula: Aula,
  quien: string,
  avisos: Avisos,
): Promise<{ reporteId: number; repetido: string | null }> {
  const tipo = b.tipo_falla!;
  const abierto = await env.DB.prepare(
    `SELECT id, reportado_en FROM reporte WHERE aula_id = ? AND tipo_falla = ? AND estado <> 'resuelto' ORDER BY id LIMIT 1`,
  )
    .bind(aula.id, tipo)
    .first<{ id: number; reportado_en: string }>();
  let reporteId: number;
  if (abierto) {
    reporteId = abierto.id;
    await env.DB.prepare("UPDATE reporte SET wa_telefono = COALESCE(wa_telefono, ?) WHERE id = ?").bind(b.telefono, abierto.id).run();
  } else {
    const nombre = b.nombre ? `${b.nombre} (WhatsApp)` : `WhatsApp ${ocultarNumero(b.telefono)}`;
    const creado = await env.DB.prepare(
      `INSERT INTO reporte (aula_id, tipo_falla, bloquea_clase, descripcion, reportado_por_nombre, origen, entrada, reportado_en, estado, registrado_por, wa_telefono)
       VALUES (?, ?, ?, ?, ?, 'whatsapp', 'whatsapp_auto', ?, 'abierto', ?, ?) RETURNING id, reportado_en`,
    )
      .bind(aula.id, tipo, b.bloquea_clase, b.texto, nombre, b.recibido_en, quien, b.telefono)
      .first<{ id: number; reportado_en: string }>();
    reporteId = creado!.id;
    await env.DB.prepare("INSERT INTO reporte_evento (reporte_id, estado, email, nota, en) VALUES (?, 'abierto', ?, 'Llegó por WhatsApp', ?)")
      .bind(reporteId, quien, creado!.reportado_en)
      .run();
  }
  b.paso = null;
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE wa_borrador SET estado = 'registrado', reporte_id = ?, aula_id = ?, tipo_falla = ?, paso = NULL, texto = ?, bloquea_clase = ?,
         cerrado_por = ?, actualizado_en = ? WHERE id = ?`,
    ).bind(reporteId, aula.id, tipo, b.texto, b.bloquea_clase, quien, ahoraIso(), b.id),
    env.DB.prepare("UPDATE wa_contacto SET ultima_aula_id = ? WHERE telefono = ?").bind(aula.id, b.telefono),
  ]);
  if (!abierto) {
    for (const fotoId of b.fotos) await guardarFoto(env, reporteId, fotoId);
    await avisos.nuevoReporte({ id: reporteId, aula, tipo, bloquea: Boolean(b.bloquea_clase), texto: b.texto, quien: b.nombre ?? ocultarNumero(b.telefono) });
  }
  await avisos.cambioAula(aula.id);
  await avisarBandeja(env);
  return { reporteId, repetido: abierto?.reportado_en ?? null };
}

// "+51 9•• ••• 321": el número completo solo se ve en la bandeja de TI
export const ocultarNumero = (telefono: string) => `+${telefono.slice(0, 2)} ${telefono.slice(2, 3)}•• ••• ${telefono.slice(-3)}`;

async function agregarAReporteReciente(env: Env, telefono: string, fotoId: string, avisos: Avisos): Promise<boolean> {
  const reporte = await env.DB.prepare(
    `SELECT r.id, r.aula_id FROM reporte r WHERE r.wa_telefono = ? AND r.origen = 'whatsapp' AND r.reportado_en >= ?
       AND (SELECT COUNT(*) FROM foto_reporte f WHERE f.reporte_id = r.id) < ? ORDER BY r.id DESC LIMIT 1`,
  )
    .bind(telefono, haceMinutos(15), MAX_FOTOS)
    .first<{ id: number; aula_id: number }>();
  if (!reporte) return false;
  if (await guardarFoto(env, reporte.id, fotoId)) await avisos.cambioAula(reporte.aula_id);
  return true;
}

// Baja la foto de WhatsApp y la guarda en R2 como las del QR
async function guardarFoto(env: Env, reporteId: number, fotoId: string): Promise<boolean> {
  try {
    const info = await graph(env, `/${encodeURIComponent(fotoId)}`, { method: "GET" });
    if (!info?.ok) return false;
    const { url, mime_type } = (await info.json()) as { url?: string; mime_type?: string };
    const tipo = (mime_type ?? "").split(";")[0].trim();
    const extension = TIPOS_FOTO[tipo];
    if (!url || !extension) return false;
    const archivo = await fetch(url, { headers: { Authorization: `Bearer ${env.WA_TOKEN}` } });
    if (!archivo.ok) return false;
    const datos = await archivo.arrayBuffer();
    if (datos.byteLength === 0 || datos.byteLength > MAX_FOTO_BYTES) return false;
    const clave = `reportes/${reporteId}-${crypto.randomUUID()}.${extension}`;
    await env.FOTOS.put(clave, datos, { httpMetadata: { contentType: tipo } });
    const guardada = await env.DB.prepare(
      `INSERT INTO foto_reporte (reporte_id, r2_key) SELECT ?, ? WHERE (SELECT COUNT(*) FROM foto_reporte WHERE reporte_id = ?) < ? RETURNING id`,
    )
      .bind(reporteId, clave, reporteId, MAX_FOTOS)
      .first();
    if (!guardada) await env.FOTOS.delete(clave);
    return Boolean(guardada);
  } catch (e) {
    console.error("whatsapp: foto", e);
    return false;
  }
}

// ─── "Resuelto ✅" ─────────────────────────────────────────────────────────

// Al resolver un reporte que llegó por WhatsApp: se le avisa al docente solo si sigue abierta la ventana de 24 h.
// Si no, queda pendiente y se le cuenta la próxima vez que escriba (así nunca se paga una plantilla).
export async function avisarResuelto(env: Env, reporteId: number): Promise<void> {
  const fila = await env.DB.prepare(
    `SELECT r.id, r.tipo_falla, r.wa_telefono, a.nombre, a.seccion, a.equipo, a.espacio, c.ultimo_mensaje_en
     FROM reporte r JOIN aula a ON a.id = r.aula_id LEFT JOIN wa_contacto c ON c.telefono = r.wa_telefono
     WHERE r.id = ? AND r.wa_telefono IS NOT NULL AND r.estado = 'resuelto' AND r.wa_aviso IS NULL`,
  )
    .bind(reporteId)
    .first<{ id: number; tipo_falla: TipoFalla; wa_telefono: string; nombre: string; seccion: string | null; equipo: Aula["equipo"]; espacio: Aula["espacio"]; ultimo_mensaje_en: string | null }>();
  if (!fila) return;
  if (!dentroDeVentana(fila.ultimo_mensaje_en)) {
    await env.DB.prepare("UPDATE reporte SET wa_aviso = 'pendiente' WHERE id = ?").bind(reporteId).run();
    return;
  }
  const enviado = await enviarTexto(
    env,
    fila.wa_telefono,
    `Resuelto ✅ ${nombreFalla(fila.tipo_falla, fila)} en ${nombreAula(fila)}. Si vuelve a fallar, escríbenos por aquí.`,
  );
  await env.DB.prepare("UPDATE reporte SET wa_aviso = ? WHERE id = ?").bind(enviado ? "enviado" : "pendiente", reporteId).run();
}

// Lo resuelto mientras la ventana estaba cerrada se cuenta en cuanto el docente vuelve a escribir
async function contarResueltosPendientes(env: Env, telefono: string) {
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.tipo_falla, a.nombre, a.seccion, a.equipo, a.espacio FROM reporte r JOIN aula a ON a.id = r.aula_id
     WHERE r.wa_telefono = ? AND r.wa_aviso = 'pendiente' AND r.estado = 'resuelto' ORDER BY r.resuelto_en LIMIT 5`,
  )
    .bind(telefono)
    .all<{ id: number; tipo_falla: TipoFalla; nombre: string; seccion: string | null; equipo: Aula["equipo"]; espacio: Aula["espacio"] }>();
  if (!results.length) return;
  const lista = results.map((r) => `${nombreFalla(r.tipo_falla, r)} en ${nombreAula(r)}`);
  const texto =
    lista.length === 1
      ? `Por cierto, ya quedó resuelto ✅ ${lista[0]}.`
      : `Por cierto, ya quedaron resueltos ✅\n${lista.map((l) => `• ${l}`).join("\n")}`;
  if (await enviarTexto(env, telefono, texto)) {
    await env.DB.batch(results.map((r) => env.DB.prepare("UPDATE reporte SET wa_aviso = 'enviado' WHERE id = ?").bind(r.id)));
  }
}

// ─── Bandeja "Por clasificar" (TI) ─────────────────────────────────────────

export async function enrutarBandeja(request: Request, url: URL, env: Env, sesion: Sesion, avisos: Avisos): Promise<Response> {
  if (url.pathname === "/api/whatsapp/bandeja" && request.method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT b.*, a.nombre AS aula_nombre FROM wa_borrador b LEFT JOIN aula a ON a.id = b.aula_id
       WHERE b.estado = 'esperando' ORDER BY b.recibido_en DESC LIMIT 100`,
    ).all<FilaBorrador & { aula_nombre: string | null }>();
    const limite = haceMinutos(MINUTOS_RESPUESTA);
    const lista: BorradorWhatsapp[] = results.map((b) => ({
      id: b.id,
      telefono: b.telefono,
      nombre: b.nombre,
      texto: b.texto,
      aula_id: b.aula_id,
      aula_nombre: b.aula_nombre,
      tipo_falla: b.tipo_falla,
      bloquea_clase: b.bloquea_clase,
      fotos: leerLista(b.fotos).length,
      paso: b.paso,
      recibido_en: b.recibido_en,
      actualizado_en: b.actualizado_en,
      esperando: b.paso != null && b.intentos < 2 && b.actualizado_en >= limite,
    }));
    return json(lista);
  }
  const uno = url.pathname.match(/^\/api\/whatsapp\/bandeja\/(\d+)$/);
  if (!uno) return json({ error: "Ruta no encontrada" }, 404);
  if (sesion.rol !== "ti") return json({ error: "Solo TI clasifica los mensajes de WhatsApp" }, 403);
  const fila = await env.DB.prepare("SELECT * FROM wa_borrador WHERE id = ? AND estado = 'esperando'").bind(Number(uno[1])).first<FilaBorrador>();
  if (!fila) return json({ error: "Este mensaje ya se clasificó" }, 404);

  // Descartar: no era un reporte
  if (request.method === "DELETE") {
    await env.DB.prepare("UPDATE wa_borrador SET estado = 'descartado', paso = NULL, cerrado_por = ?, actualizado_en = ? WHERE id = ?")
      .bind(sesion.email, ahoraIso(), fila.id)
      .run();
    await avisarBandeja(env);
    return json({ ok: true });
  }
  // TI elige el aula y la falla: se crea el reporte y, si la ventana sigue abierta, se le confirma al docente
  if (request.method === "POST") {
    const datos = await request.json<Record<string, unknown>>().catch(() => null);
    const aula = await env.DB.prepare(`${SQL_AULA} WHERE id = ? AND activa = 1`).bind(Number(datos?.aula_id)).first<Aula>();
    const tipo = datos?.tipo_falla as TipoFalla;
    if (!aula || !TIPOS_FALLA.includes(tipo)) return json({ error: "Elige el aula y la falla" }, 400);
    if (!fallasDe(aula).includes(tipo)) return json({ error: "Esa falla no se puede reportar en este ambiente" }, 400);
    const b = leerBorrador(fila);
    b.tipo_falla = tipo;
    if (typeof datos?.bloquea_clase === "boolean") b.bloquea_clase = datos.bloquea_clase ? 1 : 0;
    const resultado = await registrar(env, b, aula, sesion.email, avisos);
    const contacto = await env.DB.prepare("SELECT ultimo_mensaje_en FROM wa_contacto WHERE telefono = ?").bind(fila.telefono).first<{ ultimo_mensaje_en: string }>();
    if (dentroDeVentana(contacto?.ultimo_mensaje_en)) {
      await enviarTexto(env, fila.telefono, mensajeRegistrado(resultado, aula, tipo) + (await invitacion(env, fila.telefono, aula, url.origin)));
    }
    return json({ reporte_id: resultado.reporteId }, 201);
  }
  return json({ error: "Ruta no encontrada" }, 404);
}

// ─── Envío de mensajes ─────────────────────────────────────────────────────

async function graph(env: Env, ruta: string, init: RequestInit): Promise<Response | null> {
  if (!env.WA_TOKEN || !env.WA_PHONE_ID) {
    console.error("whatsapp: faltan WA_TOKEN o WA_PHONE_ID; no se envió nada");
    return null;
  }
  const base = (env.WA_API_URL || API_GRAPH).replace(/\/+$/, "");
  return fetch(`${base}${ruta}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.WA_TOKEN.trim()}`, "Content-Type": "application/json", ...init.headers },
  });
}

async function enviar(env: Env, telefono: string, contenido: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await graph(env, `/${env.WA_PHONE_ID?.trim()}/messages`, {
      method: "POST",
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: telefono, ...contenido }),
    });
    if (res && !res.ok) console.error("whatsapp: envío", res.status, (await res.text()).slice(0, 300));
    return Boolean(res?.ok);
  } catch (e) {
    console.error("whatsapp: envío", e);
    return false;
  }
}

const enviarTexto = (env: Env, telefono: string, texto: string) => enviar(env, telefono, { type: "text", text: { body: texto, preview_url: false } });

// WhatsApp admite hasta 3 botones de 20 caracteres
const enviarBotones = (env: Env, telefono: string, texto: string, botones: { id: string; titulo: string }[]) =>
  enviar(env, telefono, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: texto },
      action: { buttons: botones.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.titulo.slice(0, 20) } })) },
    },
  });

// Y listas de hasta 10 filas de 24 caracteres
const enviarLista = (env: Env, telefono: string, texto: string, boton: string, filas: { id: string; titulo: string }[]) =>
  enviar(env, telefono, {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: texto },
      action: { button: boton.slice(0, 20), sections: [{ title: "Fallas", rows: filas.slice(0, 10).map((f) => ({ id: f.id, title: f.titulo.slice(0, 24) })) }] },
    },
  });

// ─── Utilidades ────────────────────────────────────────────────────────────

async function borradorActivo(env: Env, telefono: string): Promise<Borrador | null> {
  const fila = await env.DB.prepare(
    `SELECT * FROM wa_borrador WHERE telefono = ? AND estado = 'esperando' AND paso IS NOT NULL AND intentos < 2 AND actualizado_en >= ?
     ORDER BY id DESC LIMIT 1`,
  )
    .bind(telefono, haceMinutos(MINUTOS_RESPUESTA))
    .first<FilaBorrador>();
  return fila ? leerBorrador(fila) : null;
}

async function guardar(env: Env, b: Borrador) {
  await env.DB.prepare(
    `UPDATE wa_borrador SET texto = ?, aula_id = ?, tipo_falla = ?, bloquea_clase = ?, fotos = ?, paso = ?, intentos = ?, actualizado_en = ?
     WHERE id = ? AND estado = 'esperando'`,
  )
    .bind(b.texto, b.aula_id, b.tipo_falla, b.bloquea_clase, JSON.stringify(b.fotos), b.paso, b.intentos, ahoraIso(), b.id)
    .run();
  await avisarBandeja(env);
}

const avisarBandeja = (env: Env) => sede(env).difundir({ tipo: "whatsapp" } satisfies EventoEnVivo).catch((e) => console.error("whatsapp: en vivo", e));

function leerLista(json: string): string[] {
  try {
    const lista = JSON.parse(json);
    return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function leerBorrador(f: FilaBorrador): Borrador {
  return { ...f, fotos: leerLista(f.fotos) };
}

function fotosSueltas(c: Contacto): { id: string; en: string }[] {
  try {
    const lista = JSON.parse(c.fotos_sueltas);
    return Array.isArray(lista) ? lista.filter((f) => typeof f?.id === "string" && typeof f?.en === "string") : [];
  } catch {
    return [];
  }
}

function json(datos: unknown, status = 200): Response {
  return new Response(JSON.stringify(datos), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
