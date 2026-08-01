# Railway Staging Deployment Runbook

**Status:** Repository implementation is ready. Provider accounts, domains, secrets and human acceptance require authorized configuration.

This runbook deploys the reviewed SkillUp web, API, PostgreSQL and optional AI-worker containers to an isolated staging environment. Staging must never contain production learner, payment or provider data.

## 1. Required access and owners

Before deployment, record these items in the owner handoff and organization registers:

- Railway organization/project administrator with MFA;
- permission to connect `SkillStep/skillup-platform` only;
- staging hostname or temporary Railway web hostname;
- named deployment and rollback owners;
- managed PostgreSQL and backup owner;
- monitoring/alert owner;
- a cryptographically random staging `SESSION_SECRET`;
- a separate cryptographically random `AI_WORKER_SHARED_SECRET` when the worker is connected;
- approved SMTP account and verified sender domain for real sign-in testing;
- JazzCash sandbox pack and credentials before payment testing;
- DeepSeek key/model/privacy/budget approval before live AI testing.

Never paste credentials into GitHub issues, pull requests, source files, screenshots or chat logs.

## 2. Create the staging project

Create one Railway project named `skillup-staging` with:

1. `postgres` — managed PostgreSQL;
2. `api` — connected to this repository;
3. `web` — connected to this repository;
4. `ai-worker` — connected to this repository when AI staging evaluation begins.

Application services use the repository root and these configuration files:

- API: `/infra/railway/api.railway.json`
- Web: `/infra/railway/web.railway.json`
- AI worker: `/infra/railway/ai-worker.railway.json`

The API applies checked-in migrations before traffic and gates on `/v1/ready`. The web gates on `/api/health`. The worker runs a single replica with zero deployment overlap.

## 3. PostgreSQL

- Provision an isolated managed PostgreSQL database.
- Use private networking for API access.
- Enable encrypted backups and the strongest supported point-in-time recovery appropriate for staging.
- Restrict access to the API, named database owner and approved recovery operators.
- Do not load production data. Use checked-in migrations and deterministic reviewed launch data only.

## 4. API variables

Set on the `api` service:

```dotenv
APP_ENV=staging
API_HOST=0.0.0.0
PUBLIC_APP_URL=https://<staging-web-hostname>
DATABASE_URL=<private-managed-postgresql-url>
DATABASE_MAX_CONNECTIONS=10
MAINTENANCE_INTERVAL_SECONDS=60
SESSION_COOKIE_NAME=skillup_session
SESSION_SECRET=<at-least-32-random-bytes>
SESSION_IDLE_MINUTES=60
SESSION_ABSOLUTE_HOURS=168
AUTH_CHALLENGE_MINUTES=10
EMAIL_PROVIDER=disabled
FEATURE_PREMIUM_ENABLED=false
FEATURE_JAZZCASH_ENABLED=false
JAZZCASH_MODE=disabled
AI_WORKER_SHARED_SECRET=
RELEASE_SHA=<approved-main-commit-sha>
LOG_LEVEL=info
```

Do not set `API_PORT`; the runtime accepts the provider-injected `PORT` value.

### Enable staging email

For real passwordless sign-in testing, replace the email section with approved SMTP values:

```dotenv
EMAIL_PROVIDER=smtp
EMAIL_FROM=no-reply@<verified-sender-domain>
SMTP_HOST=<smtp-host>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_USERNAME=<smtp-username>
SMTP_PASSWORD=<smtp-secret>
```

Use port `465` with `SMTP_SECURE=true` only when the provider requires implicit TLS. Never use a personal mailbox password.

### Enable premium without payments

`FEATURE_PREMIUM_ENABLED=true` may be enabled in staging after the entitlement/capability test plan is approved. Keep JazzCash disabled and use only authorized synthetic/admin entitlement operations to test locked and unlocked experiences.

### Enable JazzCash sandbox

Set these only after the merchant-specific sandbox contract is reviewed:

```dotenv
FEATURE_PREMIUM_ENABLED=true
FEATURE_JAZZCASH_ENABLED=true
JAZZCASH_MODE=sandbox
JAZZCASH_MERCHANT_ID=<protected-sandbox-value>
JAZZCASH_PASSWORD=<protected-sandbox-value>
JAZZCASH_INTEGRITY_SALT=<protected-sandbox-value>
JAZZCASH_PAYMENT_URL=<approved-sandbox-https-endpoint>
JAZZCASH_RETURN_URL=https://<staging-web-hostname>/en/account/payment-return
JAZZCASH_VERSION=<merchant-approved-version>
JAZZCASH_TXN_TYPE=<merchant-approved-type>
JAZZCASH_BANK_ID=<merchant-approved-bank-id>
JAZZCASH_PRODUCT_ID=<merchant-approved-product-id>
JAZZCASH_CHECKOUT_MINUTES=15
```

Sandbox and production credentials must use separate secret scopes.

## 5. Web variables

Set on the `web` service:

```dotenv
PUBLIC_APP_URL=https://<staging-web-hostname>
API_BASE_URL=http://<private-api-service-host-and-port>
RELEASE_SHA=<same-approved-main-commit-sha>
```

`API_BASE_URL` is server-only. Do not create a `NEXT_PUBLIC_API_*` variable or expose the private API host in browser code.

## 6. AI-worker service

Create the worker only when AI staging evaluation is authorized. Attach one encrypted persistent volume mounted at:

```text
/var/lib/skillup-ai
```

Set on both API and worker:

```dotenv
AI_WORKER_SHARED_SECRET=<same-separate-random-secret>
```

Set on the worker:

```dotenv
APP_ENV=staging
FEATURE_AI_GENERATION_ENABLED=true
AI_PROVIDER=deepseek
AI_FALLBACK_PROVIDER=disabled
DEEPSEEK_API_KEY=<protected-key>
DEEPSEEK_API_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=<approved-model>
AI_MAX_COST_USD_PER_JOB=<approved-limit>
AI_DAILY_BUDGET_USD=<approved-limit>
AI_MONTHLY_BUDGET_USD=<approved-limit>
AI_MAX_CONCURRENCY=1
AI_MAX_RETRIES=2
AI_REQUEST_TIMEOUT_SECONDS=30
AI_CIRCUIT_FAILURE_THRESHOLD=5
AI_CIRCUIT_RESET_SECONDS=60
AI_CACHE_TTL_SECONDS=86400
AI_BUDGET_DB_PATH=/var/lib/skillup-ai/ai-gateway.sqlite3
AI_JOB_API_URL=http://<private-api-service-host-and-port>
AI_JOB_API_TIMEOUT_SECONDS=15
AI_WORKER_SHARED_SECRET=<same-secret-as-api>
AI_WORKER_ID=skillup-staging-worker-1
AI_WORKER_POLL_SECONDS=1
AI_WORKER_LEASE_SECONDS=120
AI_WORKER_MAX_ATTEMPTS=3
OPENROUTER_APP_NAME=SkillUp
RELEASE_SHA=<same-approved-main-commit-sha>
```

The worker must remain one replica while its budget/cache ledger uses SQLite. Do not share the SQLite file over NFS. If AI remains disabled, the worker is intentionally not required for initial web/API staging.

## 7. Observability

Configure approved endpoints on applicable services:

```dotenv
OTEL_EXPORTER_OTLP_ENDPOINT=<approved-endpoint>
SENTRY_DSN=<approved-project-dsn>
```

Verify that logs and traces redact cookies, authorization, OTPs, provider credentials, payment secrets and private responses. Alerts must reach named owners for web/API health, database saturation, authentication failure spikes, payment/reconciliation failures, AI queue/cost failures and backup failures.

## 8. Initial deployment order

1. PostgreSQL becomes healthy.
2. Deploy API from the approved commit.
3. Confirm the migration command completes.
4. Confirm API `/v1/ready` returns HTTP 200.
5. Deploy web from the same commit.
6. Confirm web `/api/health` returns HTTP 200.
7. Attach the staging web domain and set the final `PUBLIC_APP_URL` on web and API.
8. Redeploy both from the same commit and confirm matching release identities.
9. Configure SMTP and run account testing.
10. Enable premium capability staging tests.
11. Add the worker only after DeepSeek approval.
12. Enable JazzCash only after sandbox credentials and mapping are approved.

A migration failure, readiness failure or release-SHA mismatch blocks testing. Do not bypass a gate by changing health endpoints or editing a running service.

## 9. Automated live smoke

From a clean checkout of the exact deployed commit:

```bash
corepack enable
corepack prepare pnpm@11.17.0 --activate
pnpm install --frozen-lockfile
SKILLUP_WEB_URL=https://<staging-web-hostname> \
SKILLUP_EXPECTED_RELEASE_SHA=<deployed-commit-sha> \
pnpm smoke:live
```

Set `SKILLUP_API_URL` only if the API intentionally has a protected public staging URL. The standard smoke verifies it through the same-origin web proxy.

The smoke verifies release identity, public HTML, security/cache/index boundaries, PWA assets, API liveness/readiness and key public content routes.

## 10. Complete manual staging acceptance

Use dedicated staging accounts and record browser, viewport, network profile, deployed SHA, tester, timestamp and evidence. Never record codes, cookies or secrets.

### Public and PWA

- Verify home, five skill pages, path pages, guides, questions, comparisons and glossary pages.
- Verify canonical, robots, sitemap, structured data and no unsupported claims.
- Verify install, offline fallback, update and private-cache exclusion.
- Verify mobile widths, keyboard, screen reader, 200% zoom, reduced motion, long text and future RTL layout safety.

### Account and privacy

- Test valid, invalid, expired, reused and rate-limited email codes.
- Complete onboarding and update profile/privacy preferences.
- List sessions; revoke one and revoke all.
- Accept each policy from the relevant flow.
- Request and retrieve a bounded privacy export.
- Test deletion request, cooldown/cancellation and execution with retained payment/audit evidence.

### Learning

- Start and complete all five launch paths through representative levels.
- Exercise every challenge type.
- Verify baseline/end assessment evidence, scoring, hints, remediation and recommendations.
- Interrupt and resume exact sessions across refresh and reauthentication.
- Verify duplicate/replayed submissions cannot duplicate progress or rewards.
- Verify short-response confidence/evidence and manual-review fallback.

### Progress, sharing and moderation

- Verify progress, points, streaks, badges and achievements.
- Confirm leaderboard and achievement sharing are off by default.
- Opt in using an alias and confirm no private profile/contact/history is exposed.
- Submit content/share reports and verify authorized moderation and audit records.

### Premium and commercial

- Verify the transactional free daily mission limit.
- Verify entitlement-derived locked/unlocked experiences and revocation/refund effects.
- Verify order, timeout, pending recovery, scheduled reconciliation and operator views.
- When JazzCash sandbox is enabled, execute success, cancellation, failure, pending-to-success, expiry, duplicate callback, tampered signature, wrong amount/currency, outage, refund/reversal and settlement reconciliation scenarios.

### AI and administration

- Verify admin role/capability positive and negative matrices.
- Verify content draft, review, publication, correction, scheduling, archive and rollback.
- Verify AI request, worker lease, result, artifact, review, publication and cancellation.
- Verify provider timeout, malformed output, budget exhaustion, retry, circuit breaker and outage behavior.
- Confirm model output cannot change scoring, progress, entitlement, authorization or publication directly.

## 11. Backup and rollback

- Create an encrypted PostgreSQL backup.
- Restore it into an isolated database and run the repository recovery verification.
- Snapshot/online-back up the worker SQLite volume when AI is enabled.
- Record the previous known-good web/API/worker artifact identities.
- Roll back application artifacts without rebuilding.
- Do not reverse a database migration blindly; use backward compatibility or a reviewed forward repair migration.
- Run live smoke after restore and after rollback.

## 12. Staging completion gate

Staging is accepted only when:

- exact release identities match across deployed services;
- all required automated and manual journeys pass;
- no unresolved P0/P1 security, privacy, payment, accessibility or data-integrity defect remains;
- alerts, backup, restore and rollback have evidence and named owners;
- every enabled external provider passes its approved failure and recovery scenarios;
- accepted lower risks have owner, rationale, control and review date.

Staging success does not itself authorize production. Production promotion requires the exact staging-approved artifacts, production secrets, production domains, controlled provider transactions and explicit named approval.
