import { test } from 'node:test';
import assert from 'node:assert/strict';
import { direccionHazio } from '../worker/direccion.ts';

test('Los QR antiguos mantienen ruta y parámetros sin bucle en Hazio', () => {
  const request = new Request('https://aulaviva.smp1.workers.dev/r/204?via=qr', {
    headers: { Accept: 'text/html' },
  });
  const response = direccionHazio(request);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Location'), 'https://hazio.smp1.workers.dev/r/204?via=qr');
  assert.equal(direccionHazio(new Request(response.headers.get('Location'), request)), null);
});

test('No redirige operaciones, API, WebSocket ni recursos de instalaciones anteriores', () => {
  for (const request of [
    new Request('https://aulaviva.smp1.workers.dev/api/sesion', { headers: { Accept: 'text/html' } }),
    new Request('https://aulaviva.smp1.workers.dev/api/qr/204', { method: 'POST', body: 'reporte' }),
    new Request('https://aulaviva.smp1.workers.dev/sw.js'),
    new Request('https://aulaviva.smp1.workers.dev/api/en-vivo', { headers: { Upgrade: 'websocket' } }),
    new Request('http://localhost:5192/docente', { headers: { Accept: 'text/html' } }),
  ]) assert.equal(direccionHazio(request), null);
});
