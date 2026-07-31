# SkillUp Production Readiness

This gate covers the current beta slice and the disabled-by-default AI execution foundation: public discovery, passwordless account access, onboarding, reviewed gameplay, progress/rewards, and the provider-agnostic generation worker.

## Code-complete gate

A release candidate is eligible for deployment only when:

- locked installation, migrations, seed, database smoke, format, lint, typecheck, tests and builds pass;
- production web, API and AI worker images build from the same commit and run as non-root users;
- the web/API production images pass live smoke against PostgreSQL;
- the disabled AI worker passes health smoke without credentials or outbound provider calls;
- deterministic AI evaluation fixtures and privacy/schema/cost/retry/fallback/circuit/queue tests pass;
- public pages remain server-rendered, indexed and explicitly cacheable;
- account, learning, progress and API surfaces remain private, no-store and noindex where applicable;
- security headers, request limits, origin checks, idempotency and protected scoring boundaries pass;
- release evidence records the commit and immutable image identifiers;
- no unresolved P0/P1 defect exists.

## AI feature boundary

The AI worker may be deployed while generation remains disabled. Enabling a provider requires all of the following:

- approved provider agreement, privacy/data-processing terms and data residency decision;
- approved provider/model/task evaluation against the versioned fixture and rubric set;
- approved minimized input fields, output schema, prompt version and publication boundary;
- approved per-job, daily and monthly cost ceilings;
- persistent worker storage, backup, restore and provider-failover drills;
- provider credentials injected through the secret manager;
- explicit `FEATURE_AI_GENERATION_ENABLED=true` promotion approval.

AI output is always draft material. It cannot change progress, scoring, identity, payment, entitlements or publication state directly.

## Other feature boundaries

Until separately reviewed and enabled, these capabilities remain off:

- live AI generation;
- premium plans and entitlements;
- JazzCash or any payment flow.

## Deployment-only actions

The following remain outside automated code completion:

- create production infrastructure, DNS and provider accounts;
- provision persistent AI worker storage and inject/rotate secrets;
- approve security, accessibility, privacy, legal and model-task sign-off;
- execute isolated restore, provider-failover and rollback drills;
- promote traffic or AI generation.

## Stop conditions

Do not deploy or enable AI when release identity differs, migrations fail, readiness is degraded, smoke/evaluation checks fail, private data becomes cacheable/indexable, a provider/model lacks approval, budget controls are unavailable, critical alerts lack an owner, or rollback evidence is missing.
