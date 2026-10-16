import { importJWK, SignJWT } from "jose";

// Notificaciones push (Web Push) sin librerías: el cifrado del mensaje (RFC 8291, aes128gcm)
// y la firma VAPID (RFC 8292) se hacen con WebCrypto, que ya trae el Worker.
//
// Claves: VAPID_PUBLICA (punto P-256 sin comprimir, 65 bytes) y VAPID_PRIVADA (32 bytes),
// ambas en base64url. Se generan con `npm run push:claves`.

export interface SuscripcionPush {
  endpoint: string;
  p256dh: string; // clave pública del navegador
  auth: string; // secreto de autenticación del navegador
}

export interface ClavesVapid {
  publica: string;
  privada: string;
  contacto: string; // URL o mailto: que el servicio push usa para contactar al dueño
}

const texto = new TextEncoder();

export function base64url(bytes: Uint8Array): string {
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function deBase64url(valor: string): Uint8Array {
  const b64 = valor.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(valor.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function unir(...partes: Uint8Array[]): Uint8Array {
  const total = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) {
    total.set(p, i);
    i += p.length;
  }
  return total;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, largo: number): Promise<Uint8Array> {
  const clave = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, clave, largo * 8);
  return new Uint8Array(bits);
}

// Cifra el mensaje para un navegador (RFC 8291). `salt` y `efimera` solo se pasan en pruebas.
export async function cifrar(
  sub: Pick<SuscripcionPush, "p256dh" | "auth">,
  mensaje: Uint8Array,
  salt: Uint8Array = crypto.getRandomValues(new Uint8Array(16)),
  efimera?: CryptoKeyPair,
): Promise<Uint8Array> {
  const publicaNavegador = deBase64url(sub.p256dh);
  const secreto = deBase64url(sub.auth);
  const par =
    efimera ?? ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair);
  const publicaServidor = new Uint8Array((await crypto.subtle.exportKey("raw", par.publicKey)) as ArrayBuffer);

  const claveNavegador = await crypto.subtle.importKey("raw", publicaNavegador, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const compartido = new Uint8Array(
    // Los tipos de workers-types llaman "$public" a la propiedad, pero el runtime espera "public"
    await crypto.subtle.deriveBits({ name: "ECDH", public: claveNavegador } as unknown as SubtleCryptoDeriveKeyAlgorithm, par.privateKey, 256),
  );

  const ikm = await hkdf(secreto, compartido, unir(texto.encode("WebPush: info\0"), publicaNavegador, publicaServidor), 32);
  const cek = await hkdf(salt, ikm, texto.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, texto.encode("Content-Encoding: nonce\0"), 12);

  const claveAes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // Un solo registro: el mensaje seguido del delimitador 0x02
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, claveAes, unir(mensaje, new Uint8Array([2]))));

  const tamanoRegistro = new Uint8Array(4);
  new DataView(tamanoRegistro.buffer).setUint32(0, 4096);
  return unir(salt, tamanoRegistro, new Uint8Array([publicaServidor.length]), publicaServidor, cifrado);
}

// Encabezado Authorization con el JWT firmado por la clave del servidor (RFC 8292)
export async function autorizacionVapid(endpoint: string, claves: ClavesVapid): Promise<string> {
  const publica = deBase64url(claves.publica);
  const privada = await importJWK(
    {
      kty: "EC",
      crv: "P-256",
      x: base64url(publica.slice(1, 33)),
      y: base64url(publica.slice(33, 65)),
      d: claves.privada,
    },
    "ES256",
  );
  const jwt = await new SignJWT({})
    .setProtectedHeader({ typ: "JWT", alg: "ES256" })
    .setAudience(new URL(endpoint).origin)
    .setExpirationTime("12h")
    .setSubject(claves.contacto)
    .sign(privada);
  return `vapid t=${jwt}, k=${claves.publica}`;
}

// Envía un aviso. Devuelve el estado HTTP del servicio push: 404 o 410 = la suscripción ya no existe.
export async function enviarPush(sub: SuscripcionPush, datos: unknown, claves: ClavesVapid): Promise<number> {
  const cuerpo = await cifrar(sub, texto.encode(JSON.stringify(datos)));
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await autorizacionVapid(sub.endpoint, claves),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "3600", // si el celular está apagado, el aviso espera hasta una hora
      Urgency: "high", // que el celular lo entregue aunque esté en ahorro de batería
    },
    body: cuerpo,
  });
  return res.status;
}
