import { generateVapidKeys } from "../src/lib/push/vapid";

/**
 * One-off VAPID keypair generator. Run:
 *
 *   npx tsx scripts/vapid-gen.ts
 *
 * Then paste the printed lines into .env.local. The public key is also served
 * to the browser via /api/push/public-key; the private key is a SECRET and
 * must never be committed or exposed to the client.
 */
const keys = generateVapidKeys();
console.log("# Web Push VAPID keys — add to .env.local (private key is SECRET)");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:you@example.com`);
