import { describe, expect, it } from "vitest";

import {
  isEnabledLocale,
  isRouteLocale,
  localeDefinitions,
  localeDirection,
  localeFallback,
  routeLocales,
} from "./locales";

describe("locale readiness contract", () => {
  it("reserves stable English and Urdu route prefixes", () => {
    expect(routeLocales).toEqual(["en", "ur"]);
    expect(isRouteLocale("en")).toBe(true);
    expect(isRouteLocale("ur")).toBe(true);
    expect(isRouteLocale("ar")).toBe(false);
  });

  it("keeps English enabled while Urdu remains a controlled prelaunch locale", () => {
    expect(isEnabledLocale("en")).toBe(true);
    expect(isEnabledLocale("ur")).toBe(false);
    expect(localeDefinitions.ur.nativeLabel).toBe("اردو");
    expect(localeFallback("ur")).toBe("en");
  });

  it("locks correct document direction for future Urdu pages", () => {
    expect(localeDirection("en")).toBe("ltr");
    expect(localeDirection("ur")).toBe("rtl");
  });
});
