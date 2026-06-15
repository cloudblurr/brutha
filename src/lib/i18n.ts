import en from "../../locales/en.json";
import es from "../../locales/es.json";

/**
 * Lightweight internationalization (S10).
 *
 * UI strings live in JSON catalogs under `locales/`. This module selects a
 * catalog by locale and exposes a `t()` translator. It is intentionally simple
 * (no routing changes) so the single-page chat UI keeps working; next-intl can
 * be layered on later for full locale routing.
 *
 * Locale-aware tools (e.g. translate, getJoke) read `resolveLocale()` so their
 * defaults respect the user's language.
 */
export type Locale = "en" | "es";

const catalogs: Record<Locale, Record<string, string>> = {
  en: en as Record<string, string>,
  es: es as Record<string, string>,
};

export const SUPPORTED_LOCALES: Locale[] = ["en", "es"];
export const DEFAULT_LOCALE: Locale = "en";

/** Normalize an arbitrary language tag (e.g. "es-MX") to a supported locale. */
export function normalizeLocale(tag: string | undefined | null): Locale {
  if (!tag) return DEFAULT_LOCALE;
  const base = tag.toLowerCase().split("-")[0];
  return (SUPPORTED_LOCALES as string[]).includes(base)
    ? (base as Locale)
    : DEFAULT_LOCALE;
}

/**
 * Resolve the active locale.
 *  - In the browser: from <html lang> or navigator.language.
 *  - On the server: from the APP_LOCALE env var (default "en").
 */
export function resolveLocale(): Locale {
  if (typeof document !== "undefined") {
    return normalizeLocale(
      document.documentElement.lang || navigator.language
    );
  }
  return normalizeLocale(process.env.APP_LOCALE);
}

/** Translate a key for the given (or resolved) locale, falling back to en. */
export function t(key: string, locale: Locale = resolveLocale()): string {
  return catalogs[locale]?.[key] ?? catalogs.en[key] ?? key;
}
