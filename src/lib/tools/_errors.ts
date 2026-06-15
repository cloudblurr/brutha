/**
 * Uniform error handling for tools.
 *
 * Every tool's `execute` should return either its normal result or a
 * {@link ToolError} shape so the model (and the UI) always sees a consistent
 * `{ error, details? }` object instead of a thrown exception.
 */

export interface ToolError {
  error: string;
  details?: unknown;
}

/** Type guard for the uniform tool error shape. */
export function isToolError(value: unknown): value is ToolError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "string"
  );
}

/** Extract a human-readable message from an unknown thrown value. */
export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** Build a uniform tool error object. */
export function toolError(message: string, details?: unknown): ToolError {
  return details === undefined ? { error: message } : { error: message, details };
}

/**
 * Wrap a tool's async work in a try/catch that converts any thrown error into
 * the uniform {@link ToolError} shape. Use this to guarantee a tool never
 * rejects — the agent loop then always receives a structured result.
 *
 * @example
 *   execute: async (args) => safeTool("getWeather", async () => { ... })
 */
export async function safeTool<T>(
  toolName: string,
  fn: () => Promise<T>
): Promise<T | ToolError> {
  try {
    return await fn();
  } catch (e) {
    return toolError(`${toolName} failed: ${errMsg(e)}`, {
      tool: toolName,
    });
  }
}
