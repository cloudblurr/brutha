import { describe, it, expect } from "vitest";
import { createVerify, createPublicKey } from "node:crypto";
import {
  generateVapidKeys,
  buildVapidJwt,
  b64urlEncode,
  b64urlDecode,
  encryptPayload,
  audienceFromEndpoint,
} from "@/lib/push/vapid";

describe("base64url", () => {
  it("round-trips arbitrary bytes", () => {
    const buf = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(b64urlDecode(b64urlEncode(buf)).equals(buf)).toBe(true);
  });

  it("produces url-safe output (no +, /, =)", () => {
    const s = b64urlEncode(Buffer.from([251, 255, 191, 254]));
    expect(s).not.toMatch(/[+/=]/);
  });
});

describe("generateVapidKeys", () => {
  it("produces a 65-byte uncompressed public point and 32-byte private scalar", () => {
    const { publicKey, privateKey } = generateVapidKeys();
    const pub = b64urlDecode(publicKey);
    const priv = b64urlDecode(privateKey);
    expect(pub.length).toBe(65);
    expect(pub[0]).toBe(0x04); // uncompressed point marker
    expect(priv.length).toBe(32);
  });

  it("generates distinct keys each call", () => {
    expect(generateVapidKeys().publicKey).not.toBe(generateVapidKeys().publicKey);
  });
});

/** Rebuild a public KeyObject from a raw base64url P-256 point for verification. */
function publicKeyFromRaw(pubB64url: string) {
  const pub = b64urlDecode(pubB64url);
  return createPublicKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: b64urlEncode(pub.subarray(1, 33)),
      y: b64urlEncode(pub.subarray(33, 65)),
    },
    format: "jwk",
  });
}

describe("buildVapidJwt", () => {
  it("creates a three-part JWT with ES256 header and expected claims", () => {
    const keys = generateVapidKeys();
    const jwt = buildVapidJwt({
      audience: "https://fcm.googleapis.com",
      subject: "mailto:ops@example.com",
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
    });
    const parts = jwt.split(".");
    expect(parts).toHaveLength(3);
    const header = JSON.parse(b64urlDecode(parts[0]).toString());
    const payload = JSON.parse(b64urlDecode(parts[1]).toString());
    expect(header).toEqual({ typ: "JWT", alg: "ES256" });
    expect(payload.aud).toBe("https://fcm.googleapis.com");
    expect(payload.sub).toBe("mailto:ops@example.com");
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("produces a signature that verifies against the public key (ES256)", () => {
    const keys = generateVapidKeys();
    const jwt = buildVapidJwt({
      audience: "https://updates.push.services.mozilla.com",
      subject: "mailto:ops@example.com",
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
    });
    const [h, p, sig] = jwt.split(".");
    const signingInput = `${h}.${p}`;
    const rawSig = b64urlDecode(sig);
    expect(rawSig.length).toBe(64); // P-256 r||s

    const verify = createVerify("SHA256");
    verify.update(signingInput);
    verify.end();
    const valid = verify.verify(
      { key: publicKeyFromRaw(keys.publicKey), dsaEncoding: "ieee-p1363" },
      rawSig
    );
    expect(valid).toBe(true);
  });
});

describe("encryptPayload (aes128gcm)", () => {
  it("emits a well-formed aes128gcm body with the server key in the header", () => {
    // A realistic client keypair: generate one and use its public point.
    const client = generateVapidKeys();
    const authSecret = b64urlEncode(Buffer.alloc(16, 7));
    const body = encryptPayload(Buffer.from("hello push"), {
      p256dh: client.publicKey,
      auth: authSecret,
    });
    // Header: salt(16) | rs(4) | idlen(1) | keyid(65) | ciphertext | tag(16)
    expect(body.length).toBeGreaterThan(16 + 4 + 1 + 65 + 16);
    const rs = body.readUInt32BE(16);
    expect(rs).toBe(4096);
    const idlen = body[20];
    expect(idlen).toBe(65); // uncompressed server public key length
    expect(body[21]).toBe(0x04); // server key starts with uncompressed marker
  });

  it("produces different ciphertext each call (random salt + ephemeral key)", () => {
    const client = generateVapidKeys();
    const keys = { p256dh: client.publicKey, auth: b64urlEncode(Buffer.alloc(16, 1)) };
    const a = encryptPayload(Buffer.from("x"), keys);
    const b = encryptPayload(Buffer.from("x"), keys);
    expect(a.equals(b)).toBe(false);
  });
});

describe("audienceFromEndpoint", () => {
  it("reduces an endpoint URL to scheme + host", () => {
    expect(
      audienceFromEndpoint("https://fcm.googleapis.com/fcm/send/abc123:longtoken")
    ).toBe("https://fcm.googleapis.com");
  });
});
