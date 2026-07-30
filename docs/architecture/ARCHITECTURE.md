# SkillUp Target Architecture

**Status:** Proposed foundation architecture. Material changes require an ADR.

## 1. Architecture goals

- Mobile-first, fast, discoverable public web experience.
- Secure server-authoritative learning, scoring, payments, and entitlements.
- Low-cost AI generation without hard coupling to one provider.
- Clear separation between public content, learner operations, AI jobs, and administration.
- Simple enough for a lean MVP, but structured for Urdu, additional payment providers, native applications, and larger content volume later.

## 2. Recommended repository model

Use a TypeScript/Python monorepo:

```text
apps/web               Next.js App Router, TypeScript, React, PWA
apps/api               Versioned application API and domain services
services/ai-worker     Python worker for generation, validation, evaluation, and media tasks
packages/ui            Shared accessible component library and design tokens
packages/contracts     API schemas, events, generated clients, and compatibility tests
packages/content-schema Skill/path/lesson/level/challenge/translation definitions
packages/discoverability Metadata, schema.org, sitemap, canonical, hreflang, and quality rules
packages/analytics     Event names, payload schemas, and privacy controls
infra                  Containers, local stack, environments, deployment, and runbooks
```

The first implementation may colocate lightweight API handlers with the web application where that lowers cost without weakening domain boundaries. Payment callbacks, entitlement changes, AI jobs, and privileged operations remain server-controlled.

## 3. Core runtime components

### Web/PWA

- Next.js App Router with server components where appropriate.
- Server rendering or static generation for public discovery pages.
- Responsive mobile-first UI and installable PWA shell.
- Accessible design system with restrained animation and reduced-motion behavior.
- Route groups separating public, authenticated learner, checkout, and admin experiences.

### Application API

- Versioned REST API, with OpenAPI as the authoritative contract.
- Domain modules: identity, catalog, learning paths, gameplay, progress, rewards, social sharing, subscriptions, payments, entitlements, administration, analytics, and audit.
- PostgreSQL as the transactional source of truth.
- Redis-compatible service only where caching, queues, rate limits, or distributed locks justify it.
- S3-compatible object storage for reviewed media, generated assets, exports, and temporary processing objects.

### AI worker and model gateway

- Durable queue-based jobs for generation and evaluation.
- Provider-agnostic gateway supporting DeepSeek first where quality and policy allow, with fallback routing only through explicit configuration.
- Task policies choose model, temperature, token ceiling, timeout, retry, and cost ceiling.
- Strict JSON-schema output, content-source references, quality scoring, duplicate checks, safety checks, and review status.
- Model, provider, prompt/template, input hash, output version, latency, token usage, estimated cost, and reviewer decision recorded.

### Admin and content operations

- Separate protected route surface inside the same web application for MVP unless risk or scale requires a separate deployment.
- Server-enforced role and capability checks.
- Four-eyes approval where public/indexable AI content or payment corrections carry material risk.
- Append-only audit events for privileged actions.

## 4. Domain model

Primary entities:

- User, Profile, Preference, Session, Role, Capability
- SkillCategory, Skill, LearningPath, Module, Lesson
- Level, Challenge, AnswerOption, Explanation, LearningObjective
- ContentVersion, Translation, SourceReference, ReviewDecision, Publication
- Enrollment, Attempt, Response, Result, ProgressSnapshot
- PointLedger, Streak, Badge, Achievement, LeaderboardEntry
- Plan, Price, PaymentOrder, PaymentTransaction, Entitlement
- GenerationJob, GenerationArtifact, QualityEvaluation, ModelUsage
- ShareCard, ModerationReport
- AuditEvent, AnalyticsEventDefinition

All public learning content is versioned. A learner attempt records the exact content version used so later edits do not rewrite history.

## 5. Public and private content boundaries

### Public/indexable

- Skill and category landing pages.
- Published learning-path summaries.
- Reviewed guides, questions, glossary terms, and comparisons.
- Selected public challenge examples where pedagogically useful.
- Author/reviewer and organization information.

### Private/noindex

- Account, profile, preferences, sessions, and recovery.
- Learner dashboard, progress, attempt history, personalized recommendations, and detailed results.
- Checkout, payment status, invoices, and entitlements.
- Admin, review queues, generation jobs, cost dashboards, support tools, and audit records.
- Unpublished, draft, rejected, duplicate, or low-quality AI output.

## 6. Request and event flows

### Learning attempt

1. Client requests the next eligible level.
2. Server verifies identity/guest policy, enrollment, entitlement, prerequisites, and content version.
3. Client receives a bounded challenge payload without protected answers.
4. Client submits a response with an idempotency key.
5. Server evaluates the response, records the attempt, updates progress, and appends point/reward ledger entries transactionally.
6. Client receives result, explanation, and next-step guidance.

### AI generation

1. Authorized content operator or approved automation creates a generation request.
2. Server records immutable input, policy, expected schema, and cost ceiling.
3. Worker invokes the configured model through the gateway.
4. Output is schema-validated, safety-checked, deduplicated, quality-scored, and linked to sources/templates.
5. Passing output enters review; it is not automatically public/indexable unless the publication policy permits it.
6. Reviewer approval creates a new content version and publication record.

### JazzCash payment

1. Server creates a unique pending order for one plan and one account.
2. Client is redirected or presented the approved JazzCash flow.
3. Provider callback/status is authenticated and recorded.
4. Idempotent reconciliation transitions the transaction.
5. Successful settlement creates or extends the entitlement through a ledgered operation.
6. Client reads the server entitlement; it never activates premium locally.

## 7. Discoverability architecture

- Stable localized URL hierarchy.
- Server-rendered textual content for every public page.
- Canonical, hreflang, robots, sitemap, breadcrumb, and structured-data utilities as shared packages.
- Content templates require direct answer, summary, learning outcome, related concepts, internal links, and reviewer/source metadata.
- Automated build and scheduled checks detect broken canonicals, invalid schema, accidental noindex/index exposure, orphan pages, thin content, missing translations, and sitemap drift.

## 8. Security architecture

- Passwords hashed with an approved adaptive algorithm; no plaintext persistence.
- Secure session design selected before implementation, preferring protected cookies for the web surface where feasible.
- CSRF, XSS, injection, SSRF, upload, authorization, enumeration, brute-force, and abuse controls.
- Secrets supplied only through protected runtime environments.
- Least-privilege database, storage, queue, and CI identities.
- Signed/verified payment callbacks and replay protection.
- Prompt-injection boundaries: public/user content cannot alter system policies, tools, cost limits, publication, or privileged actions.

## 9. Delivery architecture

- Pull request required for changes to canonical `main`.
- Locked dependency installation, format, lint, type, unit, integration, contract, accessibility, SEO/discoverability, security, and production build checks.
- Immutable artifact built once and promoted through staging and production.
- Protected environments, explicit production approval, release notes, database migration checks, health verification, and rollback target.
- Preview environments may use synthetic data only.

## 10. Architecture decisions still requiring ADRs

- Final web authentication/session mechanism.
- Exact API implementation framework and degree of Next.js API colocation.
- Queue/worker and Redis-compatible provider.
- Hosting, database, object storage, and observability providers.
- JazzCash integration mode and reconciliation contract.
- First skill catalog and editorial review model.
- Urdu rollout order and translation workflow.
- Leaderboard privacy model and eligibility rules.