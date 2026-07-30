# Railway Staging Deployment Runbook

**Status:** Implementation-ready. Provider accounts, domains and secrets require authorized human configuration.

This runbook deploys the reviewed SkillUp web and API containers to an isolated staging environment with managed PostgreSQL. Staging must not contain production learner, payment or provider data.

## 1. Required access and approvals

Before deployment, an authorized operator must have:

- Railway project administration with MFA enabled;
- permission to connect `SkillStep/skillup-platform`;
- an approved staging hostname or the temporary Railway-generated web hostname;
- a cryptographically random staging session secret;
- a reviewed SMTP account and verified sender domain when real sign-in testing is required;
- agreement that JazzCash and live AI providers remain disabled;
- a named rollback owner.

Never paste credentials into GitHub issues, pull requests, source files, screenshots or chat logs.

## 2. Create the staging project

Create one Railway project named `skillup-staging` with three services:

1. `postgres` — managed PostgreSQL;
2. `api` — connected to this GitHub repository;
3. `web` — connected to this GitHub repository.

Both application services use the repository root as their source directory. Configure these Railway configuration-file paths:

- API: `/infra/railway/api.railway.json`
- Web: `/infra/railway/web.railway.json`

The API configuration builds `infra/docker/api.Dockerfile`, applies checked-in migrations before traffic is switched, and waits for `/v1/ready`. The web configuration builds `infra/docker/web.Dockerfile` and waits for `/api/health`.

## 3. API variables

Set these variables only on the `api` service:

```dotenv
APP_ENV=staging
API_HOST=0.0.0.0
PUBLIC_APP_URL=https://<staging-web-hostname>
DATABASE_URL=<private managed PostgreSQL connection URL>
DATABASE_MAX_CONNECTIONS=10
SESSION_COOKIE_NAME=skillup_session
SESSION_SECRET=<at-least-32-random-bytes>
SESSION_IDLE_MINUTES=60
SESSION_ABSOLUTE_HOURS=168
AUTH_CHALLENGE_MINUTES=10
EMAIL_PROVIDER=disabled
RELEASE_SHA=<deployed-git-commit-sha>
LOG_LEVEL=info
```

Do not set `API_PORT`; the runtime accepts the provider-injected `PORT` value.

For real passwordless sign-in testing, replace only the email section with the approved SMTP values:

```dotenv
EMAIL_PROVIDER=smtp
EMAIL_FROM=no-reply@<verified-sender-domain>
SMTP_HOST=<smtp-host>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_USERNAME=<smtp-username>
SMTP_PASSWORD=<smtp-password>
```

Use port `465` with `SMTP_SECURE=true` only when the provider explicitly requires implicit TLS. Never use a personal mailbox password.

## 4. Web variables

Set these variables only on the `web` service:

```dotenv
PUBLIC_APP_URL=https://<staging-web-hostname>
API_BASE_URL=http://<private-api-service-host-and-port>
RELEASE_SHA=<same-deployed-git-commit-sha>
```

`API_BASE_URL` is server-only. It must point to the API over Railway private networking where available. Do not create a `NEXT_PUBLIC_API_*` variable and do not expose the private API host in browser code.

## 5. Initial deployment order

Deploy in this order:

1. PostgreSQL becomes healthy.
2. API builds its immutable container.
3. API pre-deployment migration completes successfully.
4. API `/v1/ready` returns HTTP 200.
5. Web builds its immutable container.
6. Web `/api/health` returns HTTP 200.
7. Attach the staging web domain and update `PUBLIC_APP_URL` on both services if the final hostname changed.
8. Redeploy both services from the same Git commit so release identifiers match.

A migration failure, readiness failure or release-SHA mismatch blocks testing. Do not bypass the health gate by changing the endpoint.

## 6. Automated live smoke

From a clean checkout of the same commit:

```bash
corepack enable
corepack prepare pnpm@11.17.0 --activate
pnpm install --frozen-lockfile
SKILLUP_WEB_URL=https://<staging-web-hostname> \
SKILLUP_EXPECTED_RELEASE_SHA=<deployed-git-commit-sha> \
pnpm smoke:live
```

Set `SKILLUP_API_URL` only when the API intentionally has a protected public staging URL. The standard smoke path verifies the API through the same-origin web proxy.

The smoke test verifies:

- web liveness and release identity;
- meaningful server-rendered homepage HTML;
- private progress pages remain `noindex` and `no-store`;
- API liveness through the web proxy;
- database-backed API readiness;
- web/API release-SHA consistency.

The same smoke can be run through the manually dispatched `Live Staging Smoke` GitHub Actions workflow.

## 7. Manual staging journey

Use a dedicated staging learner account and complete this journey:

1. Open `/en` on a mobile-width browser and confirm the page renders without console errors.
2. Open `/en/sign-in`, request a code and verify delivery from the approved sender.
3. Enter one invalid code and confirm it fails without revealing account existence or secrets.
4. Enter the valid code and complete onboarding.
5. Start the reviewed interview pilot.
6. Refresh during a challenge and confirm the exact session resumes.
7. Submit a correct response and confirm the server explanation and score.
8. Complete the level and open `/en/progress`.
9. Confirm points, streak and achievements explain their source.
10. Confirm leaderboard participation is off by default.
11. Opt in with a staging alias and confirm no name, email, age or learning history appears.
12. Log out and confirm private pages cannot load learner data.

Record browser, viewport, network profile, commit SHA, tester, timestamp and defects. Do not record sign-in codes, cookies or SMTP credentials.

## 8. Rollback

Rollback is required when readiness, sign-in, gameplay, data integrity or private-route controls fail.

1. Stop promotion and mark the release failed.
2. Restore the previous known-good web and API deployment from its immutable image/commit.
3. Do not reverse a database migration blindly. Confirm backward compatibility or apply a reviewed forward repair migration.
4. Run `pnpm smoke:live` against the rollback target.
5. Record failed SHA, rollback SHA, migration state, evidence and owner.

Direct editing inside a running container or database is prohibited.

## 9. Production gate

Staging success does not authorize production. Production additionally requires:

- final domain and DNS ownership;
- protected GitHub/Railway production environments and explicit approver;
- least-privilege team access and MFA;
- encrypted backup and tested restore evidence;
- monitoring and alert ownership;
- incident, privacy and account-deletion runbooks;
- approved email sender and abuse operations;
- human review of reward economy and leaderboard moderation;
- legal/privacy acceptance and beta support contact;
- JazzCash sandbox approval before any payment work is enabled.
