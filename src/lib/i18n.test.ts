import { describe, it, expect } from "vitest";
import { t, normalizeLocale, DEFAULT_LOCALE } from "@/lib/i18n";

describe("i18n (S10)", () => {
  it("normalizes language tags to supported locales", () => {
    expect(normalizeLocale("es-MX")).toBe("es");
    expect(normalizeLocale("en-US")).toBe("en");
    expect(normalizeLocale("fr")).toBe(DEFAULT_LOCALE);
    expect(normalizeLocale(undefined)).toBe(DEFAULT_LOCALE);
  });

  it("translates known keys per locale", () => {
    expect(t("hero.title", "en")).toMatch(/help you today/i);
    expect(t("hero.title", "es")).toMatch(/ayudarte/i);
  });

  it("falls back to en, then the key itself", () => {
    expect(t("status.online", "es")).toBeTruthy();
    expect(t("nonexistent.key", "en")).toBe("nonexistent.key");
  });
});
