# Authentication and Session Architecture

Status: **Accepted foundation; email delivery provider pending**  
Owner: Platform engineering  
Related issue: #20

## Decision

SkillUp will launch with passwordless email verification and opaque server-side browser sessions.

The system will not use long-lived JWTs in browser storage, shared test OTPs, plaintext recovery tokens, or credentials returned from APIs. Google OIDC and verified mobile numbers may be added later through separate identity adapters without changing the learner account model.

## Account model

- `users` is the stable learner account and contains no direct email address.
- `user_email_identities` stores the verified, normalized email identity.
- `learner_profiles` stores language, age band, avatar, learning goal, and resumable onboarding state.
- An email address maps to one active learner account during MVP.
- Account deletion is represented explicitly and will be completed by a later retention/deletion slice.

## Sign-in challenge

1. The learner submits an email address.
2. The API normalizes it, applies email and requester rate limits, creates a six-digit cryptographically random code, and HMAC-hashes the code with a server secret.
3. Only the digest is stored. The plaintext code is passed directly to the configured delivery adapter and is never logged or returned by the API.
4. The challenge expires after a short configured period, permits at most five attempts, and becomes unusable after successful verification.
5. Responses avoid revealing whether an account already exists.

Email delivery remains disabled until a production provider, sender domain, templates, bounce handling, and abuse controls are approved. Local and automated tests inject a recording delivery adapter; they do not weaken the production path.

## Browser session

- Successful verification creates a 256-bit random opaque token.
- Only an HMAC digest of that token is stored in PostgreSQL.
- The browser receives the token in an `HttpOnly`, `SameSite=Lax`, path-scoped cookie.
- Staging and production cookies are also `Secure`.
- Sessions have both idle and absolute expiry and can be revoked immediately.
- Session lookup extends the idle deadline at a bounded cadence and never extends beyond absolute expiry.
- Logout revokes the server-side session and expires the browser cookie.
- Private API responses use `Cache-Control: no-store`.

## Request protection

- State-changing browser requests validate the `Origin` header when present against `PUBLIC_APP_URL`.
- Object access is resolved from the authenticated server-side user ID; a client-provided user ID is never trusted.
- Authentication headers, cookies, codes, session tokens, secrets, and digests are redacted from structured logs.
- The API does not trust forwarding headers until a reviewed proxy topology is configured.

## Operational requirements before public sign-in

- Approve and implement an email delivery adapter.
- Configure a verified sender domain and Pakistan-appropriate transactional templates.
- Store `SESSION_SECRET` in the deployment secret manager and define rotation procedure.
- Add integration tests for concurrency, replay, rate limits, expiry, revocation, and cross-user access against PostgreSQL.
- Add account deletion, retention, policy acceptance, and recovery-support operations.
- Complete human security review and threat-model sign-off.

## Rejected alternatives

### Long-lived JWT in local storage

Rejected because immediate revocation, device/session management, token theft containment, and browser storage safety are worse for the initial first-party web product.

### Shared or bypass OTP

Rejected because a static code defeats verification and was a critical weakness in the legacy platform.

### Password authentication at launch

Deferred because it adds password storage, breach response, password reset, and credential-stuffing exposure without being necessary for the first web release.

### Vendor-specific account IDs as the primary user key

Rejected to avoid authentication-provider lock-in and to support additional verified identities later.
