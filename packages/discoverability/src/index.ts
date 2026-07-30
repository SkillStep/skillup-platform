import type { PublicLocale } from "@skillup/contracts";

export const SUPPORTED_PUBLIC_LOCALES = ["en", "ur"] as const satisfies readonly PublicLocale[];

const privatePrefixes = ["/app", "/admin", "/api"] as const;

function normalizePath(path: string): string {
  const normalized = `/${path}`.replace(/\/+/g, "/");
  return normalized.length > 1 && normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

export function localizedPath(locale: PublicLocale, path = ""): string {
  const normalized = normalizePath(path);
  return normalized === "/" ? `/${locale}` : `/${locale}${normalized}`;
}

export function canonicalUrl(baseUrl: string, locale: PublicLocale, path = ""): string {
  const base = new URL(baseUrl);
  base.pathname = localizedPath(locale, path);
  base.search = "";
  base.hash = "";
  return base.toString().replace(/\/$/, "");
}

export function isPublicIndexablePath(path: string): boolean {
  const normalized = normalizePath(path);
  return !privatePrefixes.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

export function localeAlternates(baseUrl: string, path: string): Record<PublicLocale, string> {
  return {
    en: canonicalUrl(baseUrl, "en", path),
    ur: canonicalUrl(baseUrl, "ur", path),
  };
}
