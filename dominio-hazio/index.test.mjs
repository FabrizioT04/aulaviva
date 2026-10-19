import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import gateway from './index.mjs';

test('Hazio verifica Access y conserva solicitudes y respuestas de la plataforma', async (t) => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'prueba', alg: 'RS256', use: 'sig' };
  const server = createServer((req, res) => {
    assert.equal(req.url, '/cdn-cgi/access/certs');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const issuer = `http://127.0.0.1:${server.address().port}`;
  let forwarded;
  const response = new Response('respuesta original', { status: 201 });
  const env = {
    ACCESS_TEAM_DOMAIN: issuer,
    ACCESS_AUD: 'app-prueba',
    AULAVIVA: { fetch(request) { forwarded = request; return response; } },
  };
  const token = (aud = 'app-prueba', expiry = '5m') => new SignJWT({ email: 'prueba@example.test' })
    .setProtectedHeader({ alg: 'RS256', kid: 'prueba' }).setIssuer(issuer)
    .setAudience(aud).setIssuedAt().setExpirationTime(expiry).sign(privateKey);
  const request = (jwt, url = 'https://hazio.smp1.workers.dev/api/qr/204?via=lista') =>
    new Request(url, { method: 'POST', body: 'contenido intacto', headers: {
      Origin: 'https://hazio.smp1.workers.dev', ...(jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {}),
    } });

  for (const jwt of [undefined, 'inventado', await token('otra-app'), await token('app-prueba', '0s')]) {
    assert.equal((await gateway.fetch(request(jwt), env)).status, 401);
    assert.equal(forwarded, undefined);
  }
  const signed = await token();
  assert.equal((await gateway.fetch(request(signed, 'https://preview.workers.dev/'), env)).status, 404);
  assert.equal((await gateway.fetch(request(signed), { ...env, ACCESS_AUD: '' })).status, 401);
  const original = request(signed);
  assert.equal(await gateway.fetch(original, env), response);
  assert.equal(forwarded, original);
  assert.equal(await forwarded.text(), 'contenido intacto');
  const socket = new Request('https://hazio.smp1.workers.dev/api/en-vivo', {
    headers: { Upgrade: 'websocket', 'Cf-Access-Jwt-Assertion': signed },
  });
  assert.equal(await gateway.fetch(socket, env), response);
  assert.equal(forwarded.headers.get('Upgrade'), 'websocket');
});
