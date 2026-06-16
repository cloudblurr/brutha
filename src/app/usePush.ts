"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Client hook for Web Push opt-in. Handles the full browser flow:
 *   1. fetch the server's VAPID public key (/api/push/public-key)
 *   2. request Notification permission
 *   3. subscribe via the service worker's pushManager
 *   4. POST the subscription to /api/push/subscribe
 *
 * Exposes status so the UI can render an "Enable notifications" button that
 * reflects permission/subscription state, and a `disable` to unsubscribe.
 */

export type PushStatus =
  | "unsupported"
  | "unconfigured"
  | "default"
  | "denied"
  | "subscribed"
  | "loading";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function usePush() {
  const [status, setStatus] = useState<PushStatus>("loading");

  const refresh = useCallback(async () => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setStatus("unsupported");
      return;
    }
    try {
      const res = await fetch("/api/push/public-key");
      const { configured } = await res.json();
      if (!configured) {
        setStatus("unconfigured");
        return;
      }
    } catch {
      setStatus("unconfigured");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    setStatus(sub ? "subscribed" : "default");
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refresh();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const enable = useCallback(async () => {
    setStatus("loading");
    try {
      const keyRes = await fetch("/api/push/public-key");
      const { configured, publicKey } = await keyRes.json();
      if (!configured || !publicKey) {
        setStatus("unconfigured");
        return false;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "default");
        return false;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const ok = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!ok.ok) {
        setStatus("default");
        return false;
      }
      setStatus("subscribed");
      return true;
    } catch (err) {
      console.warn("[push] enable failed:", err);
      await refresh();
      return false;
    }
  }, [refresh]);

  const disable = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("default");
    } catch (err) {
      console.warn("[push] disable failed:", err);
    }
  }, []);

  const sendTest = useCallback(async () => {
    const res = await fetch("/api/push/test", { method: "POST" });
    return res.ok;
  }, []);

  return { status, enable, disable, sendTest, refresh };
}
