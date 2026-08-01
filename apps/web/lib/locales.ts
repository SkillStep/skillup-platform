export const routeLocales = ["en", "ur"] as const;
export type RouteLocale = (typeof routeLocales)[number];

export type LocaleDefinition = Readonly<{
  label: string;
  nativeLabel: string;
  direction: "ltr" | "rtl";
  enabled: boolean;
  fallback: "en";
}>;

export const localeDefinitions: Readonly<Record<RouteLocale, LocaleDefinition>> = {
  en: {
    label: "English",
    nativeLabel: "English",
    direction: "ltr",
    enabled: true,
    fallback: "en",
  },
  ur: {
    label: "Urdu",
    nativeLabel: "اردو",
    direction: "rtl",
    enabled: false,
    fallback: "en",
  },
};

export function isRouteLocale(value: string): value is RouteLocale {
  return routeLocales.some((locale) => locale === value);
}

export function isEnabledLocale(value: string): value is RouteLocale {
  return isRouteLocale(value) && localeDefinitions[value].enabled;
}

export function localeDirection(locale: RouteLocale): "ltr" | "rtl" {
  return localeDefinitions[locale].direction;
}

export function localeFallback(locale: RouteLocale): "en" {
  return localeDefinitions[locale].fallback;
}
