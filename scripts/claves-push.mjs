// Genera el par de claves VAPID para las notificaciones push y muestra cómo guardarlas.
// Uso: npm run push:claves   (solo una vez; si las cambias, TI debe volver a activar los avisos)
const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const publica = Buffer.from(await crypto.subtle.exportKey("raw", par.publicKey)).toString("base64url");
const { d: privada } = await crypto.subtle.exportKey("jwk", par.privateKey);

console.log(`
Claves de notificaciones generadas. Guárdalas como secretos del Worker:

  npx wrangler secret put VAPID_PUBLICA
  (pega esta)  ${publica}

  npx wrangler secret put VAPID_PRIVADA
  (pega esta)  ${privada}

Para probar en tu computadora, agrega las dos líneas a .dev.vars:

  VAPID_PUBLICA=${publica}
  VAPID_PRIVADA=${privada}

La privada no va en el repositorio ni se comparte.
`);
