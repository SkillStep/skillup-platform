# SkillUp Production Readiness

This gate covers the current beta slice: public discovery, passwordless account access, onboarding, one reviewed learning level, gameplay, progress and rewards.

## Code-complete gate

A release candidate is eligible for deployment only when:

- locked installation, migrations, seed, database smoke, format, lint, typecheck, tests and builds pass;
- production web and API images build from the same commit and run as non-root users;
- the production images pass the full live smoke against PostgreSQL;
- public pages remain server-rendered, indexed and explicitly cacheable;
- account, learning, progress and API surfaces remain private, no-store and noindex where applicable;
- security headers, request limits, origin checks, idempotency and protected scoring boundaries pass;
- release evidence records the commit and immutable image identifiers;
- no unresolved P0/P1 defect exists.

## Feature boundary

Until separately reviewed and enabled, these capabilities must remain off:

- AI generation;
- premium plans and entitlements;
- JazzCash or any payment flow.

## Deployment-only actions

The following are intentionally outside automated code completion:

- create production infrastructure, DNS and provider accounts;
- inject or rotate production secrets;
- approve security, accessibility, privacy and legal sign-off;
- execute isolated restore and rollback drills on the selected provider;
- promote traffic.

## Stop conditions

Do not deploy when release identity differs between web and API, migrations fail, readiness is degraded, smoke checks fail, private data becomes cacheable/indexable, critical alerts lack an owner, or rollback evidence is missing.
