import { createRemoteJWKSet, jwtVerify } from 'jose';

const claves = new Map();

// Access protege el hostname; esta verificación también cierra cualquier entrada alternativa.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname !== 'hazio.smp1.workers.dev') {
      return new Response('No encontrado', { status: 404 });
    }
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
      return new Response('No autorizado', { status: 401 });
    }
    const issuer = env.ACCESS_TEAM_DOMAIN.replace(/\/+$/, '');
    try {
      if (!claves.has(issuer)) {
        claves.set(issuer, createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)));
      }
      await jwtVerify(token, claves.get(issuer), { issuer, audience: env.ACCESS_AUD });
    } catch {
      return new Response('No autorizado', { status: 401 });
    }
    // Conserva URL, Origin, cuerpo, JWT y WebSocket. Los roles se verifican en la app.
    return env.AULAVIVA.fetch(request);
  },
};
