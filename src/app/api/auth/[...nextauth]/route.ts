import { handlers } from "@/lib/auth";

/**
 * Auth.js route handler. Exposes all auth endpoints under
 * /api/auth/* (signin, callback, signout, session, csrf, providers).
 */
export const { GET, POST } = handlers;

export const runtime = "nodejs";
