"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (/sw.js) on mount so BRUTHA is installable and
 * can receive Web Push. No-op during SSR and when the browser lacks SW support.
 * Kept deliberately tiny and side-effect-only; the actual push subscription is
 * handled on demand by the usePush hook when the user opts in.
 */
export function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => {
          // Non-fatal: the app works without the SW, just not offline/push.
          console.warn("[pwa] service worker registration failed:", err);
        });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}
