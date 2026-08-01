# SkillUp Current Architecture

**Status:** Implemented repository architecture. Material runtime, security, data or provider changes require a reviewed ADR and migration/rollback plan.

## 1. Architecture goals

- Mobile-first, fast and discoverable public web experience.
- Secure server-authoritative identity, learning, scoring, progress, payments and entitlements.
- Reviewed, measurable and low-cost AI assistance without hard coupling to one model provider.
- Clear separation between public content, learner operations, commercial authority, AI execution and administration.
- English-first launch with stable Urdu-ready content identities, URLs and RTL contracts.
- Immutable, observable and reversible releases.

## 2. Repository and runtime model

SkillUp is implemented as a TypeScript/Python monorepo:

```text
apps/web                 Next.js App Router web/PWA, learner and admin interfaces
apps/api                 Fastify REST API and server-authoritative domain services
services/ai-worker       Python generation/evaluation worker
packages/ui              Accessible components and design tokens
packages/contracts       Shared API, analytics and job contracts
packages/content-schema  Versioned learning and localization schemas
packages/gameplay-engine Deterministic challenge evaluation
packages/database        PostgreSQL schema, migrations, seed and operations
packages/discoverability Metadata, JSON-LD, canonical, sitemap and quality utilities
packages/analytics       Privacy-safe event contracts and reporting helpers
infra                    Containers, Railway configuration and operational tooling
```

`SkillStep/skillup-platform` is the sole approved source for SkillUp staging and production. Legacy repositories are evidence only and cannot deploy or contribute code without an approved migration-register decision.

## 3. Runtime components

### Web/PWA

- Next.js App Router and server-rendered public content.
- Installable PWA with explicit public-cache eligibility and private-route exclusions.
- Public home, category, skill, path, guide, question, comparison and glossary families.
- Private sign-in, onboarding, learning, progress, account, checkout and admin surfaces.
- Same-origin `/api/v1/*` proxy; the browser never receives a private API service host.
- Mobile-first, keyboard-accessible and reduced-motion presentation.
- English routes with tested future Urdu canonical, fallback and RTL contracts.

### Application API

- Versioned Fastify REST API.
- PostgreSQL as the transactional source of truth.
- Domain services for identity, account lifecycle, content, gameplay, assessments, progress, rewards, sharing, entitlements, payments, AI jobs, administration, moderation, analytics and audit.
- Strict configuration validation, bounded requests, rate limits, origin checks, redacted structured logs and readiness/liveness endpoints.
- Server-side authorization and capability resolution for every privileged or premium action.

### PostgreSQL

PostgreSQL stores authoritative:

- learners, verified email identities, sessions, profiles and privacy settings;
- policies, acceptances, exports and deletion lifecycle;
- versioned skills, paths, modules, lessons, levels, challenges, sources and publications;
- gameplay sessions, attempts, assessment evidence and progress;
- points, streaks, badges, achievements, sharing and leaderboards;
- plans, orders, payment events, reconciliation and entitlement ledgers;
- admin identities, capabilities, review decisions, moderation and privileged audit events;
- analytics events, maintenance state, commercial jobs and AI job coordination.

Published content and append-only evidence cannot be silently rewritten. Learner attempts remain tied to the exact content versions used.

### AI worker and gateway

- Non-root Python worker built as a production container.
- Provider-neutral OpenAI-compatible adapters, with DeepSeek as the first economical candidate after approval.
- Disabled and deterministic adapters for fail-closed operation and CI.
- Versioned task schemas, minimized inputs, redaction, output validation, quality checks and strict cost ceilings.
- Idempotency, caching, bounded retries, timeout, fallback, circuit breakers, leases, cancellation and concurrency controls.
- Worker/API job boundary with shared-secret authentication and auditable status/result persistence.
- Single worker replica for launch while local SQLite budget/cache state is mounted on encrypted persistent storage; PostgreSQL remains authoritative for application job state.
- All generated public material remains draft until authorized human review and publication.

### Administration and operations

- Protected admin surface inside the web application.
- Capability-based authorization with explicit separation of viewing, correction, publication, export and role-management powers.
- Editorial review, version comparison, publication, rollback and moderation controls.
- Learner support, entitlement/payment reconciliation and reporting views with minimized data.
- Append-only privileged audit evidence.

## 4. Identity and account lifecycle

- Passwordless email challenge sign-in.
- Cryptographically random short-lived codes stored only as protected digests.
- Opaque browser sessions stored only as digests and delivered through secure `HttpOnly` cookies.
- Idle and absolute expiry, logout, session listing, revoke-one and revoke-all controls.
- Profile, locale, learning goal and privacy preferences.
- Versioned policy acceptance.
- Bounded authenticated export.
- Deletion request, cooldown/cancellation, execution and pseudonymization while preserving required payment and audit evidence.

Live email delivery remains disabled until an approved provider, verified sender domain and protected credentials are supplied.

## 5. Learning and gameplay

- Five reviewed launch skills, 68 levels and 204 challenges.
- Multiple choice, true/false, ordering, matching, scenario, fill-in and short-response formats.
- Server-authoritative evaluation; protected answers and scoring rules do not enter public browser payloads.
- Version-pinned sessions, idempotent submissions and safe retry/resume.
- Baseline and end-path assessment evidence.
- Hints, remediation, explanations, mastery and deterministic next-step recommendations.
- Short-response rubrics with bounded confidence, evidence and manual-review fallback.
- Transactional progress and replay-safe reward effects.

## 6. Commercial authority

- Versioned PKR 599 monthly and PKR 4,999 yearly plans.
- Server-created payment orders and append-only provider/payment evidence.
- Entitlement-derived capability projection; client state cannot grant premium.
- Transactional free daily mission enforcement.
- Expiry, refund, revocation, correction and reactivation boundaries.
- JazzCash-ready checkout, callback, status/reconciliation and refund/reversal adapter boundaries.

Merchant-specific endpoints, field rules, signing configuration, credentials and sandbox evidence remain external inputs.

## 7. Public and private boundaries

### Public and indexable

- Reviewed skills, categories and learning-path summaries.
- Reviewed guides, questions, comparisons and glossary terms.
- Approved organization, author/reviewer, source and freshness information.
- Privacy-safe public achievement/share projections where the learner opts in.

### Private, noindex and no-store

- Identity, account, privacy, session and deletion routes.
- Gameplay, assessments, progress, recommendations and detailed results.
- Checkout, payment history and entitlements.
- Admin, support, moderation, AI jobs, reporting and audit records.
- Draft, rejected, duplicate or unreviewed content.

The service worker refuses API, account, gameplay, progress, checkout, admin, preview and other private responses.

## 8. Analytics

- Versioned privacy-safe taxonomy covering discovery, account, learning, rewards, sharing, commercial, AI, support and reliability events.
- Essential-only operation before product analytics consent.
- Server-authoritative events for scoring, progress, payment, entitlement and publication outcomes.
- Deduplication and reconciliation against transactional records.
- Release/environment segmentation and reproducible KPI queries.
- Sensitive responses, credentials, OTPs, cookies and provider payloads are prohibited.

## 9. Delivery architecture

- Locked runtimes and dependencies.
- Reviewed PostgreSQL migrations and deterministic launch seed/import tooling.
- Quality CI for foundation, deployment and production contracts, secret scanning, formatting, lint, strict typing, tests, builds and production-container smoke.
- Non-root web, API and AI-worker images.
- Release identity and evidence generation.
- Checked-in Railway configuration for web, API and the single-replica worker.
- Migration-before-traffic, health/readiness gates and same-artifact staging/production promotion.
- Backup/restore and rollback verification tooling.
- No direct editing of a running container or production database.

## 10. External deployment decisions

The repository is provider-portable, while the checked-in staging reference is Railway. Before staging, authorized owners must decide and supply:

- staging and production project/accounts;
- domains, DNS and TLS ownership;
- protected runtime secrets;
- managed PostgreSQL and backup ownership;
- encrypted persistent worker volume;
- SMTP/email provider and verified sender;
- JazzCash merchant contracts and credentials;
- optional DeepSeek model/key/budget/privacy approval;
- monitoring provider, alert recipients and incident ownership;
- GitHub/environment approvers and independent high-risk reviewers.

Changing from Railway to AWS or another provider requires an ADR and equivalent immutable-container, private-networking, migration, secret, health, backup, monitoring and rollback controls. It does not require changing product/domain contracts.
