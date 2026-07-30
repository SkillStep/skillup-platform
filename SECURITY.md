# SkillUp Security Policy and Baseline

## Reporting a vulnerability

Do not disclose exploitable vulnerabilities, credentials, private learner information, payment references, or production access details in a public issue. Use the organization’s approved private security-reporting channel. Until that channel is configured, contact the repository administrators privately and include only the minimum reproduction evidence required.

## Security objectives

SkillUp must protect:

- learner accounts, age/profile data, preferences, learning activity, progress, and achievements;
- authentication and recovery systems;
- payment orders, JazzCash transaction state, and premium entitlements;
- content publication and AI-generation controls;
- scoring, rewards, leaderboards, and anti-abuse systems;
- administrative capabilities, audit records, and support access;
- model prompts, provider credentials, cost controls, and private source material;
- infrastructure, backups, release credentials, and production data.

## Mandatory controls

### Identity and sessions

- Use an approved adaptive password-hashing algorithm.
- Never store or log plaintext passwords.
- Prefer protected, Secure, HttpOnly, SameSite cookies for the browser session where the final design supports them.
- Enforce expiry, logout, recovery, revocation, session rotation, and account-deletion behavior.
- Rate-limit and monitor login, recovery, verification, and enumeration-sensitive endpoints.
- Require step-up authorization for high-risk administrative or payment corrections where appropriate.

### Authorization

- Enforce roles, capabilities, ownership, and object scope on the server.
- Client-side gates are UX only and never the authority.
- Deny cross-user, cross-role, and unauthorized admin access through negative tests.
- Record privileged actions with actor, target, action, time, result, and reason without secrets.

### Payments and entitlements

- Authenticate JazzCash callbacks/status responses according to the approved provider contract.
- Use unique order and provider references, idempotency keys, replay protection, and explicit state transitions.
- Activate premium only from verified server-side transaction state.
- Reconcile pending, failed, duplicate, refunded, expired, and mismatched transactions.
- Never store payment secrets or unnecessary provider data in the client or analytics.

### AI and content

- All provider calls go through the model gateway.
- Enforce bounded inputs, output schemas, token/cost ceilings, timeouts, retries, and circuit breakers.
- Treat user and external content as untrusted prompt input.
- Model output cannot directly change privileged state or publish public content outside policy.
- Avoid sending private data unless explicitly required, minimized, approved, and protected.
- Retain traceability while redacting sensitive prompts and outputs from routine logs.

### Application and API

- Validate input at every trust boundary.
- Use parameterized queries and safe serialization.
- Protect against XSS, CSRF, injection, SSRF, open redirects, path traversal, insecure deserialization, broken object authorization, and mass assignment.
- Use strict CORS, secure headers, content security policy, bounded request sizes, and endpoint-appropriate timeouts.
- Validate file content by magic bytes/decoding, enforce size/page/archive budgets, scan where appropriate, and store outside executable paths.
- Use generic external errors and structured internal diagnostics without secrets or unnecessary PII.

### Data and privacy

- Collect the minimum data needed for the product outcome.
- Define retention, deletion, export, backup, and restore behavior before production.
- Encrypt data in transit and at rest using approved platform controls.
- Keep production data out of development, tests, previews, screenshots, and model evaluation fixtures.
- Private account, progress, payment, and admin routes must not be indexed.

### Supply chain and delivery

- Use locked dependencies and approved runtimes.
- Run dependency, secret, static, container, and infrastructure scans.
- Pin or review third-party GitHub Actions and minimize workflow permissions.
- Pull-request workflows must not receive production deployment secrets.
- Build immutable artifacts and promote the same artifact through staging and production.
- Protect production environments, record approvals, and retain rollback targets.

## Secrets

- Secrets must be supplied through protected environment/secret-management systems.
- `.env` files with values, cloud keys, payment credentials, database URIs, model-provider tokens, signing keys, and service-account material are prohibited in Git.
- A committed or logged credential is treated as compromised and must be revoked/rotated; deletion from the current branch is not sufficient.

## Logging and analytics

Never log or send to analytics:

- passwords, OTPs, reset tokens, session tokens, authorization headers, cookies, provider secrets, private keys;
- complete payment payloads or sensitive provider fields;
- unnecessary phone numbers, email addresses, dates of birth, or private learning responses;
- unredacted model prompts/outputs containing private data.

Logs must include release and correlation identifiers, use structured fields, and apply centralized redaction.

## Security testing before production

At minimum:

- authentication, recovery, logout, expiry, revocation, and enumeration tests;
- horizontal and vertical authorization tests;
- payment callback signature/replay/idempotency/reconciliation tests;
- XSS, CSRF, injection, SSRF, upload, rate-limit, and abuse tests;
- AI prompt-injection and privileged-tool boundary tests;
- dependency/secret/static/container scans;
- backup restoration and application rollback drills;
- security review of public indexing and private-route exclusion.

## Incident handling

Production readiness requires named owners and runbooks for:

- account compromise;
- credential exposure;
- payment or entitlement mismatch;
- public content or model safety incident;
- data exposure or privacy request;
- service outage, corrupted release, queue failure, or database recovery;
- abuse of rewards, sharing, or leaderboards.

Urgency does not justify restoring insecure behavior or bypassing audit evidence.