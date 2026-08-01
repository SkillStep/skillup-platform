# SkillUp Production Readiness

This gate covers the complete repository-side launch implementation: public discovery, account/privacy lifecycle, five-skill learning experience, progress/rewards/sharing, premium authority, commercial automation, administration, analytics and provider-neutral AI execution.

## Repository-complete gate

A release candidate is eligible for staging only when:

- locked installation, migrations, reviewed launch seed/import, database smokes, formatting, lint, strict type checks, tests and builds pass;
- production web, API and AI-worker images build from the same commit and run as non-root users;
- production web/API images pass live end-to-end smoke against migrated PostgreSQL;
- disabled AI-worker health and deterministic AI evaluation pass without credentials or provider calls;
- all five reviewed skills, 68 levels, 204 challenges, assessments and all seven challenge formats pass completeness/integrity checks;
- account/session, consent, policies, export and deletion workflows have positive and negative automated coverage;
- entitlement-derived capability checks and free daily mission enforcement are transactional and server-authoritative;
- public route families remain server-rendered, indexable and explicitly cacheable only where approved;
- account, gameplay, progress, payment, admin and API surfaces remain private, no-store and noindex where applicable;
- AI jobs, commercial jobs, maintenance runners and privileged audit records satisfy idempotency and recovery constraints;
- security headers, request limits, origin checks, authorization, protected-answer boundaries and secret scans pass;
- backup/restore verification tooling succeeds;
- release evidence records source commit and immutable image identities;
- no unresolved repository-side P0/P1 defect exists.

## Feature activation boundaries

Feature flags are rollout and emergency controls; they are not acceptance for unfinished code.

### Premium

The premium capability system is implemented. Enabling `FEATURE_PREMIUM_ENABLED=true` requires approved pricing/benefit copy, support/refund policy and staging evidence for free limits, entitlement activation, expiry, refund, revocation and reactivation.

### JazzCash

The provider-independent order, callback, reconciliation and entitlement boundaries are implemented. Enabling JazzCash requires:

- current merchant-specific sandbox/production integration pack;
- approved field, secure-hash, response-code, status, refund/reversal and settlement mapping;
- isolated sandbox/production credentials in protected secret stores;
- sandbox evidence for success, cancellation, failure, pending, expiry, replay/tamper, outage, refund and reconciliation;
- controlled production transaction and settlement approval.

Client claims can never activate premium.

### AI

The AI worker and application job boundary are implemented. Enabling live generation requires:

- approved provider agreement and privacy/data-processing terms;
- approved provider/model/task golden evaluation;
- approved minimized input fields, prompt/schema versions and publication boundary;
- approved per-job, daily and monthly cost ceilings;
- encrypted persistent worker storage with backup/restore evidence;
- worker/API shared secret and provider key injected through protected runtime secrets;
- alert ownership for cost, queue age, failures, validation and provider outages;
- explicit `FEATURE_AI_GENERATION_ENABLED=true` approval.

AI output is draft material. It cannot directly change identity, authorization, scoring, progress, payment, entitlements or publication state.

### Email OTP

The passwordless account flow is implemented. Enabling SMTP requires an approved provider, verified sender domain, SPF/DKIM/DMARC ownership, protected credentials, abuse/rate-limit operations and delivery/bounce/complaint monitoring.

## Deployment-only actions

These actions require external accounts, credentials or human authority and cannot be completed in source code alone:

- create staging/production projects, managed PostgreSQL, private networking and worker volume;
- configure domains, DNS and TLS;
- inject and rotate protected secrets;
- configure monitoring, alerts and named escalation paths;
- configure GitHub branch/environment protection and independent reviewers;
- execute deployed browser/device/accessibility/slow-network, load, abuse and dependency-failure testing;
- execute live provider, backup restore and artifact rollback drills;
- approve legal/privacy/refund/support copy and operating owners;
- promote traffic or enable live providers.

## Required staging evidence

The staging evidence bundle must identify:

- source commit and immutable web/API/worker image identities;
- migration set and database release state;
- automated CI and live-smoke results;
- all five skill paths and challenge-format results;
- account/privacy/deletion/export results;
- premium/capability and JazzCash sandbox results when enabled;
- AI provider/task/cost/quality results when enabled;
- accessibility, device/browser, PWA and constrained-network results;
- security, abuse, performance and load results;
- backup/restore and application rollback results;
- dashboards, alerts, owners, incidents and accepted residual risks;
- explicit staging acceptance decision.

## Production promotion gate

Production may proceed only when:

- the exact staging-approved artifacts are promoted without rebuilding;
- production migrations, readiness and release identities are verified;
- production secrets are isolated and kill switches remain available;
- one controlled OTP sign-in succeeds;
- one controlled JazzCash transaction and settlement succeeds when payments launch;
- one controlled DeepSeek operation succeeds when live AI launches;
- monitoring, backup, reconciliation, support and rollback owners are active;
- no unresolved P0/P1 defect remains;
- named approvers authorize gradual traffic opening with explicit stop conditions.

## Stop conditions

Do not deploy, promote or enable a provider when:

- release identities differ;
- migrations, readiness, smoke or recovery checks fail;
- private data becomes cacheable or indexable;
- client state can affect authority;
- a provider/model/merchant contract lacks approval;
- cost, reconciliation, backup, monitoring or rollback controls are unavailable;
- critical alerts have no owner;
- secrets appear in code, logs, issues or artifacts;
- an unresolved P0/P1 security, privacy, payment, accessibility or data-integrity defect exists.
