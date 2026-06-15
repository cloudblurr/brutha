import { auth } from "./auth";
import { GLOBAL_SCOPE } from "./scope";

/**
 * Resolve the per-user data scope for the current request from the Auth.js
 * session. Returns the signed-in user's id, or the "global" fallback scope when
 * no one is signed in (preserves pre-auth single-operator behaviour).
 *
 * Call this in API route handlers (server context) and pass the result into
 * `runWithScope(...)` so tools read the correct owner.
 */
export async function resolveRequestScope(): Promise<string> {
  try {
    const session = await auth();
    return session?.user?.id || GLOBAL_SCOPE;
  } catch {
    return GLOBAL_SCOPE;
  }
}
