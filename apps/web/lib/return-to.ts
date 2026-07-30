const appOrigin = "https://skillup.invalid";
const maximumReturnToLength = 2_048;

function isReservedAccountPath(pathname: string): boolean {
  return (
    pathname === "/en/sign-in" ||
    pathname.startsWith("/en/sign-in/") ||
    pathname === "/en/onboarding" ||
    pathname.startsWith("/en/onboarding/")
  );
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 31 || codePoint === 127)) return true;
  }
  return false;
}

export function safeReturnTo(
  value: string | readonly string[] | undefined,
  fallback = "/en",
): string {
  const candidate = typeof value === "string" ? value : value?.[0];
  if (
    !candidate ||
    candidate.length > maximumReturnToLength ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    hasControlCharacters(candidate)
  ) {
    return fallback;
  }

  try {
    const destination = new URL(candidate, appOrigin);
    const isEnglishRoute =
      destination.pathname === "/en" || destination.pathname.startsWith("/en/");
    if (
      destination.origin !== appOrigin ||
      !isEnglishRoute ||
      isReservedAccountPath(destination.pathname)
    ) {
      return fallback;
    }

    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return fallback;
  }
}

export function withReturnTo(pathname: string, returnTo: string): string {
  return `${pathname}?returnTo=${encodeURIComponent(returnTo)}`;
}
