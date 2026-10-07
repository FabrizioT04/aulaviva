import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Sesion } from "../shared/tipos";
import type { Env } from "./index";

// Quién hace la petición y con qué rol.
//
// En producción, Cloudflare Access protege toda la app: el usuario inicia sesión
// con su correo y Access agrega a cada petición un JWT firmado
// (cabecera Cf-Access-Jwt-Assertion). Aquí se verifica esa firma; nunca se confía
// solo en la cabecera de correo, porque cualquiera podría escribirla.
//
// Sin Access configurado (desarrollo local), TI entra con la clave TOKEN_TI.

const jwksPorEquipo = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function accessConfigurado(env: Env): boolean {
  return Boolean(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD);
}

export async function obtenerSesion(request: Request, url: URL, env: Env): Promise<Sesion | null> {
  if (accessConfigurado(env)) return sesionAccess(request, env);
  return sesionLocal(request, url, env);
}

async function sesionAccess(request: Request, env: Env): Promise<Sesion | null> {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return null;

  const equipo = env.ACCESS_TEAM_DOMAIN!.replace(/\/+$/, "");
  let jwks = jwksPorEquipo.get(equipo);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${equipo}/cdn-cgi/access/certs`));
    jwksPorEquipo.set(equipo, jwks);
  }

  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: equipo, audience: env.ACCESS_AUD });
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
    const rol = rolDe(email, env);
    return email && rol ? { email, rol, modo: "access" } : null;
  } catch {
    return null;
  }
}

async function sesionLocal(request: Request, url: URL, env: Env): Promise<Sesion | null> {
  const enviado =
    request.headers.get("Authorization")?.replace(/^Bearer /, "") ??
    url.searchParams.get("token") ?? // los WebSockets del navegador no envían cabeceras
    "";
  if (env.TOKEN_TI && enviado && iguales(enviado, env.TOKEN_TI)) {
    return { email: "ti@local", rol: "ti", modo: "local" };
  }
  // Para probar la página del QR en tu computadora sin Access
  const esLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (esLocal && env.DEV_EMAIL_DOCENTE && url.pathname.startsWith("/api/qr/")) {
    return { email: env.DEV_EMAIL_DOCENTE.toLowerCase(), rol: "docente", modo: "local" };
  }
  return null;
}

// TI: correos listados en TI_EMAILS. Docente: cualquier correo del dominio del colegio.
function rolDe(email: string, env: Env): Sesion["rol"] | null {
  const ti = (env.TI_EMAILS ?? "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  if (ti.includes(email)) return "ti";
  const dominio = (env.DOMINIO_DOCENTES ?? "innovaschools.edu.pe").toLowerCase();
  if (email.endsWith(`@${dominio}`)) return "docente";
  return null;
}

function iguales(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  return x.byteLength === y.byteLength && crypto.subtle.timingSafeEqual(x, y);
}
