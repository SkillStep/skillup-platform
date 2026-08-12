# Mandatory staging certification

Status: implementation under #97, #98, #99 and #100.

## Release contract

The permanent release flow is:

`Code / PR → Quality CI → immutable staging deployment → deployed identity gate → automated staging certification → READY FOR UAT → human UAT → explicit production approval → promote exact tested artifacts → production smoke`

A staging URL being reachable is not release evidence.

## SkillUp architecture mapped to certification

The canonical source is `SkillStep/skillup-platform`.

- `apps/web` contains public discovery, learner flows, Premium UI and the protected Admin UI.
- `apps/api` contains the server-authoritative identity, gameplay, progress, commercial, Admin and reporting APIs.
- `services/ai-worker` is the single-replica AI worker.
- PostgreSQL is the application authority.
- Admin is **not** a separate deployment from the Web application.
- SkillUp has no cart, delivery/take-away, store-branch Dispatcher, Redis or websocket order system. Generic commerce/dispatcher certification scenarios are therefore not applicable and must not be invented.

## Commands

The orchestrator is:

```bash
pnpm certify:staging
```

The Playwright runner is the `qa/staging-certification` pnpm workspace package. Its exact Playwright dependency and transitive dependency graph are committed in the repository lockfile. Normal Quality CI installs that package but does not run live staging certification; the protected staging workflow installs Chromium and invokes the dedicated `certify` script only after deployment.

The permanent workflow is `.github/workflows/staging-certification.yml`.

It supports:

- controlled `workflow_dispatch` reruns;
- `workflow_call` from a GitHub-controlled staging deployment workflow;
- `repository_dispatch` event `skillup-staging-deployed` from an approved external deployment controller.

The deployment provider should invoke certification only after Web, API, database migrations and AI worker (when required) report healthy.

## Gate zero: deployed release identity

The Web and API runtime expose safe release metadata only:

- `releaseSha`;
- `pipelineId`;
- `artifactRef`;
- `imageDigest`;
- `rollbackRef`.

Staging/production deployment automation must set these runtime variables:

```text
RELEASE_SHA
RELEASE_PIPELINE_ID
RELEASE_ARTIFACT_REF
RELEASE_IMAGE_DIGEST
ROLLBACK_ARTIFACT_REF
```

Container builds also accept build argument `RELEASE_SHA` and write it to the OCI `org.opencontainers.image.revision` label. Quality CI passes the exact candidate SHA into all three reviewed container builds and rejects an image whose OCI revision label does not match.

Certification compares running metadata with the deployment controller's expected values before browser tests start. Missing or mismatched identity is `BLOCKED`.

For the AI worker, the deployment controller passes its safe running SHA, immutable artifact reference and image digest to certification. The worker does not expose an Internet-facing health endpoint. Provider/platform deployment metadata remains the authority for the running worker image.

## Staging GitHub Environment

Create a protected GitHub Environment named `staging`.

### Environment variables

Configure these non-secret values:

```text
STAGING_WEB_URL
STAGING_API_URL                         # optional when direct API is private/unreachable from runner
STAGING_REQUIRE_EMAIL=true
STAGING_REQUIRE_AI=true
STAGING_REQUIRE_JAZZCASH=true
STAGING_REQUIRE_VISUALS=true
STAGING_EMAIL_PROVIDER_READY=true
STAGING_DEEPSEEK_READY=true
STAGING_JAZZCASH_SANDBOX_READY=true
STAGING_VISUAL_BASELINES_APPROVED=true
STAGING_QA_LEARNER_PREMIUM_READY=true
STAGING_QA_LEARNER_EMAIL
STAGING_QA_ADMIN_EMAIL
STAGING_QA_ANALYST_EMAIL
STAGING_QA_MAILBOX_URL
```

Readiness variables are assertions owned by the staging deployment/integration procedure. Setting a readiness variable to `true` does not by itself pass certification: the corresponding runtime/browser tests must still pass.

### Environment secrets

```text
STAGING_QA_MAILBOX_TOKEN
```

Do not place DeepSeek, SMTP, JazzCash, database or session credentials in the browser certification workflow. Those belong in the runtime platform's staging secret store. Certification tests the deployed behavior instead of reading provider secrets.

## Staging-only identities

Prepare three named, non-production accounts:

1. learner QA account;
2. broad Admin QA account with the explicitly approved roles required by the Admin suite, including `content_editor`, `content_reviewer`, `publisher`, `security_admin` and the required payment/report capabilities;
3. `analyst` QA account with read-only reporting access.

The learner QA account must have an audited temporary Premium staging entitlement so certification can exercise all five launch levels without being blocked by the intentional three-free-missions-per-day limit.

Administrative roles must be assigned through the existing audited bootstrap/role process. Never create shared passwords or a static OTP bypass.

## OTP mailbox contract

Passwordless certification must test real staging email delivery. `STAGING_QA_MAILBOX_URL` points to a protected test-mailbox retrieval service. Certification calls:

```text
GET <mailbox-url>?email=<qa-email>&after=<ISO timestamp>
Authorization: Bearer <STAGING_QA_MAILBOX_TOKEN>
```

The service returns only the latest matching staging test code:

```json
{"code":"123456"}
```

The code is used in memory and is never logged or written to artifacts. A 404 means no message has arrived yet and is polled for a bounded period. This is a mailbox retrieval mechanism, not an authentication bypass.

## Deployment dispatch payload

An approved deployment controller may trigger GitHub `repository_dispatch` with event type `skillup-staging-deployed` and safe payload fields equivalent to:

```json
{
  "event_type": "skillup-staging-deployed",
  "client_payload": {
    "expected_release_sha": "<git-sha>",
    "pipeline_id": "<deployment-run-id>",
    "web_artifact_ref": "<immutable-web-ref>",
    "web_image_digest": "sha256:<digest>",
    "api_artifact_ref": "<immutable-api-ref>",
    "api_image_digest": "sha256:<digest>",
    "ai_release_sha": "<git-sha>",
    "ai_artifact_ref": "<immutable-worker-ref>",
    "ai_image_digest": "sha256:<digest>",
    "previous_release_ref": "<known-good-rollback-ref>"
  }
}
```

Do not include secrets in repository-dispatch payloads.

## Certification coverage

### Runtime/API

- Web health;
- proxied API version and DB-backed readiness;
- optional direct API identity;
- all five reviewed launch skills present;
- existing bounded `smoke:live` contract.

### Learner

- public discovery and reviewed path pages;
- passwordless email start/delivery/verification;
- unauthenticated learning protection;
- account/session/privacy/export/deletion-cooldown behavior;
- authenticated progress/learning surfaces;
- Premium capability authority;
- all five launch entry levels;
- all seven supported challenge types;
- replay-safe submission/idempotency check;
- desktop Chromium and Pixel-class mobile Chromium.

### Premium

- PKR 599 monthly and PKR 4,999 yearly authority;
- two-plan contract;
- checkout-order replay safety;
- provider checkout handoff structure;
- capability remains server-authoritative.

Provider-specific JazzCash success/pending/failure/cancel/refund/reconciliation certification is mandatory once the merchant sandbox contract is configured. Until then #97 must remain `BLOCKED — PAYMENT SANDBOX NOT CONFIGURED`; internal order/callback smokes are not a substitute for provider sandbox evidence.

### AI

- Admin creates a safe `summarize_content` request tagged with the QA run identifier;
- the PostgreSQL job is claimed by the AI worker and executed by the configured staging provider;
- a validated artifact is observed through the Admin API;
- the artifact is approved, published to a staging-only target and rolled back;
- the expected provider is DeepSeek unless staging explicitly declares another approved provider.

The API/worker bridge strips queue-envelope metadata before provider policy validation while preserving genuinely invalid user fields so privacy checks still fail closed.

### Admin

- Admin session resolved server-side;
- protected operations and Premium workspace;
- Premium report authority and Karachi timezone contract;
- read-only analyst separation;
- direct unauthorized export mutation rejected.

The suite should be extended with every new Admin/content/payment operation and every staging/UAT regression.

### Visual regression

Visual tests use `toHaveScreenshot` and never update baselines automatically. The first intentional baseline or any material change requires human approval and a reviewed commit. Until approved baselines exist, certification reports `BLOCKED — VISUAL REVIEW REQUIRED`.

## Evidence and privacy

Each run writes:

- `artifacts/staging-certification/certification.json`;
- `artifacts/staging-certification/certification.md`;
- Playwright JSON and HTML reports;
- failure screenshots.

Playwright trace and video are disabled for this certification suite. Authentication storage state is deleted before artifact upload. OTPs, cookies, session tokens, provider credentials and payment secrets must never appear in GitHub logs/artifacts.

## Decision model

The orchestrator prints exactly one final release decision:

- `READY FOR UAT` — every mandatory configured area passed;
- `FAILED` — a reproducible application/security/business failure exists;
- `BLOCKED` — the candidate cannot be validly certified because deployment identity, provider setup, fixtures or visual approval is missing.

`FAILED` and `BLOCKED` exit non-zero. A critical test that needs a retry is not green because Playwright retries are permanently set to zero for staging certification.

## Human UAT and production

Human UAT starts only after `READY FOR UAT` and remains an explicit manual approval. Production promotion is a separate action. It must promote the exact staging/UAT-approved artifacts without rebuilding and run non-destructive smoke only.

## Permanent regression rule

A feature is not complete without appropriate unit/API/Playwright happy-path, negative, authorization, Premium/payment/Admin and responsive coverage. Every defect found in QA/UAT must be captured as a permanent regression test before the defect is considered closed.
