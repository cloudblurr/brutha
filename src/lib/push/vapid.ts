import {
  createSign,
  createECDH,
  createHmac,
  createCipheriv,
  randomBytes,
  generateKeyPairSync,
  createPrivateKey,
  KeyObject,
} from "node:crypto";

/**
 * Self-contained Web Push (RFC 8030 / 8291 / 8292) using ONLY Node's built-in
 * crypto — no `web-push` dependency. This keeps the dependency surface flat and
 * every byte of the push pipeline auditable in-repo, which matters for a
 * security-focused app.
 *
 * Two pieces are implemented here:
 *   1. VAPID (RFC 8292): an ES256 JWT signed with the server's P-256 private
 *      key, proving the push request comes from this application server.
 *   2. Message encryption (RFC 8291, `aes128gcm` content encoding): the payload
 *      is encrypted to the subscriber's public key so the push service (FCM /
 *      Mozilla / Apple) relays ciphertext it cannot read.
 */

// ---------------------------------------------------------------------------
// base64url helpers
// ---------------------------------------------------------------------------

export function b64urlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

// ---------------------------------------------------------------------------
// VAPID key generation
// ---------------------------------------------------------------------------

export interface VapidKeys {
  publicKey: string; // base64url, uncompressed P-256 point (65 bytes)
  privateKey: string; // base64url, raw 32-byte scalar
}

/**
 * Generate a fresh VAPID keypair as the base64url strings browsers and push
 * services expect. Run once; store the result in env (VAPID_PUBLIC_KEY /
 * VAPID_PRIVATE_KEY). The public key is also handed to the browser so it can
 * subscribe.
 */
export function generateVapidKeys(): VapidKeys {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  return {
    publicKey: b64urlEncode(rawPublicKey(publicKey)),
    privateKey: b64urlEncode(rawPrivateKey(privateKey)),
  };
}

/** Extract the raw 65-byte uncompressed EC point from a KeyObject. */
function rawPublicKey(key: KeyObject): Buffer {
  const jwk = key.export({ format: "jwk" }) as { x: string; y: string };
  return Buffer.concat([
    Buffer.from([0x04]),
    b64urlDecode(jwk.x),
    b64urlDecode(jwk.y),
  ]);
}

/** Extract the raw 32-byte private scalar from a KeyObject. */
function rawPrivateKey(key: KeyObject): Buffer {
  const jwk = key.export({ format: "jwk" }) as { d: string };
  return b64urlDecode(jwk.d);
}

/** Rebuild a private KeyObject from a raw base64url scalar + public point. */
function privateKeyFromRaw(privB64url: string, pubB64url: string): KeyObject {
  const d = b64urlDecode(privB64url);
  const pub = b64urlDecode(pubB64url); // 0x04 || X || Y
  const x = pub.subarray(1, 33);
  const y = pub.subarray(33, 65);
  return createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      d: b64urlEncode(d),
      x: b64urlEncode(x),
      y: b64urlEncode(y),
    },
    format: "jwk",
  });
}

// ---------------------------------------------------------------------------
// VAPID JWT (RFC 8292) — ES256
// ---------------------------------------------------------------------------

/**
 * Build a signed VAPID JWT for the given push-service origin (audience).
 * `subject` must be a mailto: or https: contact URI for the operator.
 */
export function buildVapidJwt(params: {
  audience: string;
  subject: string;
  publicKey: string;
  privateKey: string;
  expiresInSeconds?: number;
}): string {
  const header = b64urlEncode(
    Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" }))
  );
  const exp =
    Math.floor(Date.now() / 1000) + (params.expiresInSeconds ?? 12 * 60 * 60);
  const payload = b64urlEncode(
    Buffer.from(
      JSON.stringify({ aud: params.audience, exp, sub: params.subject })
    )
  );
  const signingInput = `${header}.${payload}`;

  const key = privateKeyFromRaw(params.privateKey, params.publicKey);
  const sign = createSign("SHA256");
  sign.update(signingInput);
  sign.end();
  // Node emits DER-encoded ECDSA signatures; JWT/JWS needs raw r||s (64 bytes).
  const der = sign.sign({ key, dsaEncoding: "der" });
  const sig = derToJose(der);
  return `${signingInput}.${b64urlEncode(sig)}`;
}

/** Convert a DER-encoded ECDSA signature to JOSE raw r||s (64 bytes for P-256). */
function derToJose(der: Buffer): Buffer {
  // SEQUENCE { INTEGER r, INTEGER s }
  let offset = 2;
  if (der[1] & 0x80) offset += der[1] & 0x7f; // long-form length
  // r
  if (der[offset] !== 0x02) throw new Error("invalid DER signature (r)");
  const rLen = der[offset + 1];
  let r = der.subarray(offset + 2, offset + 2 + rLen);
  offset = offset + 2 + rLen;
  // s
  if (der[offset] !== 0x02) throw new Error("invalid DER signature (s)");
  const sLen = der[offset + 1];
  let s = der.subarray(offset + 2, offset + 2 + sLen);

  r = trimOrPad(r);
  s = trimOrPad(s);
  return Buffer.concat([r, s]);
}

function trimOrPad(buf: Buffer): Buffer {
  // Strip leading zero padding, then left-pad to 32 bytes.
  let b = buf;
  while (b.length > 32 && b[0] === 0x00) b = b.subarray(1);
  if (b.length < 32) {
    const out = Buffer.alloc(32);
    b.copy(out, 32 - b.length);
    return out;
  }
  return b;
}

// ---------------------------------------------------------------------------
// Payload encryption (RFC 8291, aes128gcm)
// ---------------------------------------------------------------------------

export interface PushSubscriptionKeys {
  p256dh: string; // base64url client public key
  auth: string; // base64url 16-byte auth secret
}

/**
 * Encrypt `payload` for a subscription's keys using the aes128gcm content
 * encoding. Returns the body bytes to POST to the push endpoint.
 */
export function encryptPayload(
  payload: Buffer,
  keys: PushSubscriptionKeys
): Buffer {
  const clientPublic = b64urlDecode(keys.p256dh); // 65 bytes
  const authSecret = b64urlDecode(keys.auth); // 16 bytes

  // Ephemeral server ECDH keypair.
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const serverPublic = ecdh.getPublicKey(); // 65 bytes uncompressed
  const sharedSecret = ecdh.computeSecret(clientPublic);

  const salt = randomBytes(16);

  // PRK_key = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 ||
  //                client_public || server_public, 32)
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0"),
    clientPublic,
    serverPublic,
  ]);
  const ikm = hkdf(authSecret, sharedSecret, keyInfo, 32);

  // CEK = HKDF(salt, ikm, "Content-Encoding: aes128gcm" || 0x00, 16)
  const cek = hkdf(
    salt,
    ikm,
    Buffer.from("Content-Encoding: aes128gcm\0"),
    16
  );
  // NONCE = HKDF(salt, ikm, "Content-Encoding: nonce" || 0x00, 12)
  const nonce = hkdf(
    salt,
    ikm,
    Buffer.from("Content-Encoding: nonce\0"),
    12
  );

  // Plaintext padded with a single 0x02 delimiter (no extra padding).
  const plaintext = Buffer.concat([payload, Buffer.from([0x02])]);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  // aes128gcm header: salt(16) | rs(4, big-endian) | idlen(1) | keyid(server pub)
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096, 0);
  const idlen = Buffer.from([serverPublic.length]);
  return Buffer.concat([
    salt,
    rs,
    idlen,
    serverPublic,
    ciphertext,
    tag,
  ]);
}

/** HKDF (RFC 5869) with SHA-256, single-pass (L <= 32). */
function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
  const prk = createHmac("sha256", salt).update(ikm).digest();
  const t = createHmac("sha256", prk)
    .update(Buffer.concat([info, Buffer.from([0x01])]))
    .digest();
  return t.subarray(0, length);
}

/** The push-service origin (scheme + host) used as the JWT audience. */
export function audienceFromEndpoint(endpoint: string): string {
  const u = new URL(endpoint);
  return `${u.protocol}//${u.host}`;
}
