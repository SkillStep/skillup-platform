# ADR 0003 — Identity, API and Transactional Data

- **Status:** Accepted for MVP foundation
- **Date:** 2026-07-30
- **Owners:** SkillUp engineering and security
- **Related:** #16

## Context

The web product needs secure sessions, future native-client compatibility, a versioned API, server-authoritative progress and payments, and clear database transactions. The previous product used unsafe long-lived tokens and client assumptions; SkillUp must not inherit those patterns.

## Decision

### Web identity and sessions

- Use secure server-managed sessions for the browser.
- The browser receives an opaque random session token only in a `Secure`, `HttpOnly`, `SameSite=Lax` cookie.
- Store only a keyed hash of the session token server-side.
- Rotate the session identifier after authentication, password/recovery changes and privilege elevation.
- Apply bounded idle and absolute expiry.
- Protect state-changing browser requests with same-origin checks and CSRF controls appropriate to the final framework.
- Do not store access tokens, refresh tokens or passwords in localStorage, sessionStorage, Redux or client logs.

### MVP sign-in methods

- Email and password with Argon2id hashing.
- Google sign-in through OpenID Connect as an optional convenience route.
- Email verification and one-time, expiring recovery tokens.
- A mobile number may be collected and verified only where required for payment, recovery or approved product behavior; it is not the primary authentication secret.

### Future native clients

Native applications will use a separate OAuth/OIDC-compatible token exchange with short-lived access tokens and rotating refresh tokens stored in platform secure storage. Browser cookie sessions remain independent.

### API

- Use a separate TypeScript `apps/api` service built on Fastify.
- REST endpoints are versioned under `/v1`.
- OpenAPI is the authoritative public contract.
- Request and response schemas are generated or shared through `packages/contracts`.
- Next.js may use server actions or route handlers only for web-specific presentation/BFF concerns. Payment callbacks, entitlement changes, scoring, progress, AI jobs and privileged administration remain in the application API.

### Data

- PostgreSQL 18 is the transactional source of truth.
- Use Drizzle ORM and SQL migrations.
- Database constraints, transactions and idempotency keys enforce critical invariants.
- Every learner attempt records the exact content version.
- Points, payment and entitlement changes use append-only ledgers plus derived current state.
- Soft deletion is not used as a universal default; retention behavior is defined per entity.

## Requirements

- Cross-user and cross-role access is denied server-side.
- Payment, entitlement, scoring and reward actions are idempotent.
- Public rendering can read published content without exposing private learner data.
- Recovery does not permit account enumeration, replay or long-lived reset authority.
- Session revocation and account deletion are operationally possible.
- Database migrations are reversible where safe and use expand/migrate/contract patterns for production changes.

## Alternatives considered

### Browser bearer tokens

Rejected because browser-readable long-lived tokens increase XSS, extension and shared-device risk and were a confirmed weakness in the legacy product.

### JWT-only sessions

Rejected for the web MVP. Stateless tokens complicate immediate revocation, recovery invalidation and fine-grained session management. Signed tokens may still be used for narrow, short-lived purposes.

### Passwordless-only authentication

Not selected for launch because email deliverability and learner expectations need testing. The architecture can add magic-link or code-based sign-in later.

### Phone/OTP-first authentication

Not selected as the primary method because SMS/WhatsApp cost, delivery reliability, abuse and recovery complexity add operational risk. Phone verification may be introduced for specific flows.

### NestJS

Not selected because the MVP benefits from Fastify's smaller surface and direct control. The domain structure must still be modular and testable.

### Prisma

Not selected. Drizzle's SQL-first approach, lighter runtime and explicit migration control better match ledger and transaction requirements. This may be revisited if team capability or tooling evidence changes.

### MongoDB

Rejected as the primary database because SkillUp has relational, versioned, transactional and ledger-heavy domains.

## Cost implications

The selected software is open source. Managed PostgreSQL, backups and database observability are expected infrastructure costs. Server-side sessions add database or cache reads, which are acceptable for the MVP and can be optimized with a bounded session cache later.

## Security implications

- Passwords use Argon2id with reviewed parameters and per-password salt.
- Authentication endpoints use rate limits, non-enumerating responses and abuse monitoring.
- Session cookies are never readable by JavaScript.
- Authorization is object-level and server-enforced.
- Database roles follow least privilege.
- Sensitive events produce audit records without credentials or unnecessary personal data.
- OpenAPI examples use synthetic data only.

## Operational burden

The team must operate migrations, session cleanup, email verification/recovery delivery and OIDC configuration. Runbooks must cover compromised sessions, account recovery abuse and identity-provider outage.

## Migration path

No legacy credentials or sessions are migrated. If selected legacy user/profile data is reused later, identity migration requires a separate consent, security and data-quality plan.

## Rollback and revisit triggers

Revisit when:

- native applications become an active release target;
- email/password conversion or recovery performance is poor;
- session-store load becomes material;
- Fastify/OpenAPI tooling blocks delivery;
- Drizzle migration or type-safety evidence is insufficient;
- legal or product requirements mandate phone-first identity.

Rollback preserves secure cookie sessions and database integrity. It must never reintroduce plaintext passwords, browser-persisted bearer tokens, generic JWT authorization or client-authoritative roles.