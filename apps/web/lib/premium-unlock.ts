/** Client flag set after JazzCash success so Premium nav routes to Features before sign-in. */
export const PREMIUM_UNLOCKED_STORAGE_KEY = "skillup_premium_unlocked";

export function markPremiumUnlocked(): void {
  try {
    sessionStorage.setItem(PREMIUM_UNLOCKED_STORAGE_KEY, "1");
  } catch {
    // Ignore storage access failures.
  }
}

export function hasPremiumUnlockedFlag(): boolean {
  try {
    return sessionStorage.getItem(PREMIUM_UNLOCKED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
