import personas from "../../locales/personas/personas.json";

/**
 * Persona overlays (AGENT_PERSONA).
 *
 * A persona is a short additional system-prompt block layered on top of the
 * shared base prompt, letting BRUTHA be re-skinned for different business
 * contexts (legal / finance / ops / general) with zero code change — just an
 * env var. Personas live in locales/personas/personas.json so they're editable
 * without a rebuild of the prompt logic.
 */

export interface Persona {
  label: string;
  overlay: string;
}

const REGISTRY = personas as Record<string, Persona>;
export const DEFAULT_PERSONA = "general";

export function availablePersonas(): string[] {
  return Object.keys(REGISTRY);
}

/** Resolve the active persona id from env, falling back to the default. */
export function resolvePersonaId(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.AGENT_PERSONA?.trim().toLowerCase();
  if (raw && raw in REGISTRY) return raw;
  return DEFAULT_PERSONA;
}

/** Get a persona by id (or the active one from env). */
export function getPersona(id: string = resolvePersonaId()): Persona {
  return REGISTRY[id] ?? REGISTRY[DEFAULT_PERSONA];
}

/** The overlay text for the active persona, or "" if it's the plain default. */
export function getPersonaOverlay(id: string = resolvePersonaId()): string {
  return getPersona(id).overlay ?? "";
}
