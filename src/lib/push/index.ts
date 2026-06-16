import { getDb } from "../db";
import { currentScope } from "../scope";
import {
  audienceFromEndpoint,
  buildVapidJwt,
  encryptPayload,
  generateVapidKeys,
  type PushSubscriptionKeys,
} from "./vapid";
import { increment } from "../metrics";

/**
 * Web Push orchestration: configuration gate, per-user subscription storage,
 * and the actual encrypted POST to a subscriber's push endpoint. Built on the
 * dependency-free VAPID/encryption primitives in ./vapid.
 *
 * Like email/Temporal, push is an OPTIONAL integration: without VAPID keys the
 * feature reports "not configured" and the rest of the app is unaffected.
 */

export interface PushConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** Resolve push config from env, or null when not configured. */
export function getPushConfig(): PushConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  const subject =
    process.env.VAPID_SUBJECT?.trim() || "mailto:admin@example.com";
  return { publicKey, privateKey, subject };
}

export function isPushConfigured(): boolean {
  return getPushConfig() !== null;
}

/** The browser needs the public key (base64url) to call pushManager.subscribe. */
export function getPushPublicKey(): string | null {
  return getPushConfig()?.publicKey ?? null;
}

// Re-export so a one-off setup script / route can mint keys without reaching
// into the low-level module.
export { generateVapidKeys };

// ---------------------------------------------------------------------------
// Subscription storage (per-user scoped)
// ---------------------------------------------------------------------------

export interface StoredSubscription {
  id: number;
  scope: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
}

export interface BrowserSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Upsert a browser subscription for the current user scope. */
export function saveSubscription(
  sub: BrowserSubscription,
  userAgent?: string | null
): void {
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    throw new Error("Invalid push subscription: endpoint and keys are required");
  }
  getDb()
    .prepare(
      `INSERT INTO push_subscriptions (scope, endpoint, p256dh, auth, userAgent)
       VALUES (@scope, @endpoint, @p256dh, @auth, @userAgent)
       ON CONFLICT(endpoint) DO UPDATE SET
         scope = @scope, p256dh = @p256dh, auth = @auth, userAgent = @userAgent`
    )
    .run({
      scope: currentScope(),
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: userAgent ?? null,
    });
}

/** Remove a subscription by endpoint (any scope — endpoint is globally unique). */
export function removeSubscription(endpoint: string): void {
  getDb()
    .prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
    .run(endpoint);
}

/** All subscriptions for a scope (defaults to the current request's user). */
export function listSubscriptions(scope?: string): StoredSubscription[] {
  const s = scope ?? currentScope();
  return getDb()
    .prepare(
      "SELECT id, scope, endpoint, p256dh, auth, userAgent FROM push_subscriptions WHERE scope = ?"
    )
    .all(s) as StoredSubscription[];
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export interface PushMessage {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
}

export interface SendResult {
  endpoint: string;
  ok: boolean;
  status?: number;
  removed?: boolean;
  error?: string;
}

/**
 * Send a single encrypted push message to one subscription. Returns a result
 * rather than throwing so a fan-out can continue past one dead endpoint. A
 * 404/410 means the subscription is gone — we delete it.
 */
export async function sendPush(
  subscription: { endpoint: string; keys: PushSubscriptionKeys },
  message: PushMessage,
  ttlSeconds = 60 * 60 * 24
): Promise<SendResult> {
  const config = getPushConfig();
  if (!config) {
    return {
      endpoint: subscription.endpoint,
      ok: false,
      error: "push not configured (set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)",
    };
  }

  try {
    const audience = audienceFromEndpoint(subscription.endpoint);
    const jwt = buildVapidJwt({
      audience,
      subject: config.subject,
      publicKey: config.publicKey,
      privateKey: config.privateKey,
    });

    const payload = Buffer.from(JSON.stringify(message), "utf8");
    const body = encryptPayload(payload, subscription.keys);

    const res = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${jwt}, k=${config.publicKey}`,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(ttlSeconds),
        Urgency: "normal",
      },
      body: new Uint8Array(body),
    });

    if (res.status === 404 || res.status === 410) {
      removeSubscription(subscription.endpoint);
      increment("push.subscription_expired");
      return {
        endpoint: subscription.endpoint,
        ok: false,
        status: res.status,
        removed: true,
      };
    }

    const ok = res.status >= 200 && res.status < 300;
    increment(ok ? "push.sent" : "push.failed");
    return { endpoint: subscription.endpoint, ok, status: res.status };
  } catch (e) {
    increment("push.failed");
    return {
      endpoint: subscription.endpoint,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Fan-out a message to every subscription in a scope (or the current user's).
 * Returns one result per endpoint; expired endpoints are pruned automatically.
 */
export async function sendPushToScope(
  message: PushMessage,
  scope?: string
): Promise<SendResult[]> {
  const subs = listSubscriptions(scope);
  if (subs.length === 0) return [];
  return Promise.all(
    subs.map((s) =>
      sendPush(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        message
      )
    )
  );
}
