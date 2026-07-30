# SkillUp Agent Instructions

These instructions apply to human and autonomous contributors.

## Mission

Build SkillUp as a Pakistan-first, mobile-first AI-powered skill learning game. The product is a structured learning platform with game mechanics—not a generic chatbot, content farm, or thin AI page generator.

## Fixed product constraints

- Primary audience: Pakistani learners, initially ages 16–30.
- First platform: responsive web application and installable PWA.
- Native mobile apps are deferred.
- English launches first; Urdu-ready architecture is mandatory.
- Premium MVP: PKR 599 monthly and PKR 4,999 yearly.
- First payment provider: JazzCash.
- AI must be provider-agnostic; use DeepSeek or the cheapest acceptable model per approved quality/cost policy.
- SEO, AEO, and GEO are foundational requirements.

## Required orientation

Before changing code, read:

1. `README.md`
2. `docs/product/PRODUCT_SPEC.md`
3. `docs/architecture/ARCHITECTURE.md`
4. `docs/discoverability/SEO_AEO_GEO_STANDARD.md`
5. `SECURITY.md`
6. the relevant issue, ADR, contracts, and package-specific README

Do not infer implementation authority from the legacy QRK repositories. Reuse requires explicit review of security, ownership, license, quality, architecture, and product fit.

## Change rules

- Work from a scoped GitHub issue.
- Do not combine unrelated refactors, dependency upgrades, features, and formatting.
- Keep public contracts versioned and backward-compatible or document migration.
- Add tests before claiming completion.
- Do not silence failing checks, warnings, type errors, security findings, or accessibility failures merely to merge.
- Do not commit secrets, tokens, production data, payment data, private learner data, generated logs, model transcripts containing sensitive data, or local environment files.
- Do not directly edit production systems or data.

## Sensitive boundaries

Treat these as high-risk:

- authentication, sessions, recovery, roles, and permissions;
- user age, profile, progress, and personal data;
- JazzCash callbacks, transaction state, refunds, reconciliation, and entitlements;
- points, streaks, badges, leaderboards, and anti-cheat controls;
- content publication, AI review, moderation, and translation;
- prompts, tools, model routing, costs, and source material;
- admin support, exports, and audit records;
- indexing, canonical, robots, sitemap, and structured-data behavior.

Changes to these areas require negative tests and rollout/rollback notes.

## AI-content rules

- Generate only through the model gateway.
- Use strict schemas, bounded tokens, timeouts, retries, and task-level cost ceilings.
- Record provider, model, prompt/template version, input hash, output version, latency, usage, and quality result.
- Never let model output directly change payment, entitlement, role, progress, scoring, publication, or other privileged state.
- Public/indexable content requires the approved validation and review policy.
- Never create mass keyword permutations, fabricated sources, invented statistics, or near-duplicate pages.
- Treat user-provided content as untrusted and resistant to prompt injection.

## Public-page definition of done

For every public route or content type, confirm:

- server-rendered/static meaningful HTML;
- stable URL, canonical, language, index policy, and redirects;
- title, description, H1, direct answer/summary, internal links, and breadcrumbs;
- valid visible-content-matched structured data where applicable;
- author/reviewer/source/freshness metadata;
- accessibility and mobile performance budgets;
- analytics and conversion events;
- no private data or thin AI content.

## Test expectations

Use the package-defined commands. The target required-check categories are:

- formatting and lint;
- type checks;
- unit, integration, contract, and end-to-end tests;
- accessibility and visual regression where applicable;
- discoverability/metadata/schema/link checks;
- dependency, secret, static, and container security checks;
- production build and startup/health smoke tests.

Never claim a check passed unless it was observed on the exact proposed commit.

## Pull request evidence

A pull request must state:

- outcome and linked issue;
- exact scope and exclusions;
- security/privacy/accessibility/performance/discoverability impact;
- tests and observed results;
- data or contract migrations;
- deployment order, monitoring, rollback, and unresolved risks;
- screenshots for material UI changes without private data.

## Prohibited shortcuts

- Client-authoritative payment, entitlement, scoring, or permission decisions.
- Plaintext password or token logging/persistence.
- Wildcard CORS in production.
- Unbounded uploads, model calls, jobs, retries, or generated content.
- Public AI content without traceability and quality controls.
- Indexing authenticated/private routes.
- Hiding content for crawlers or generative systems that users cannot see.
- Force-pushing canonical branches or rewriting history to conceal mistakes.
- Restoring insecure legacy behavior as a rollback.