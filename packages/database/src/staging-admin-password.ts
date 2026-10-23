/**
 * Staging-only password login must be backed by a sufficiently long protected secret.
 * Missing or weak values disable password login rather than restoring a shared credential.
 */
export function resolveStagingOperatorPassword(secret: string | undefined | null): string | null {
  const password = secret?.trim() ?? "";
  return password.length >= 20 ? password : null;
}
