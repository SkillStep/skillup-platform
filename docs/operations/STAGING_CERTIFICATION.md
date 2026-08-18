# Mandatory staging certification

Status: repository implementation is tracked by #97, #98, #99 and #100. A live candidate is not ready for UAT until the deployed staging workflow returns `READY FOR UAT`.

## Release contract

`Code / PR → Quality CI → immutable staging deployment → deployed identity gate → automated staging certification → READY FOR UAT → human UAT → explicit production approval → promote exact tested artifacts → production smoke`

A reachable staging URL is not release evidence.

## SkillUp architecture mapped to certification

The canonical source is `SkillStep/skillup-platform`.

- `apps/web`: public discovery, learner flows, Premium UI and protected Admin UI.
- `apps/api`: server-authoritative identity, gameplay, progress, commercial, Admin and reporting APIs.
- `services/ai-worker`: Python AI worker.
- `packages/database`: PostgreSQL/Drizzle authority.
- Admin is part of the Web artifact at `/en/admin`; there is no separate Admin deployment.
- SkillUp has no cart, delivery/take-away, branch Dispatcher, Redis or websocket order system. Generic commerce/dispatcher scenarios are not applicable.

## Commands and workflow

The orchestrator is:

```bash
pnpm certify:staging
```

Playwright lives in the `qa/staging-certification` workspace package. The permanent workflow is `.github/workflows/staging-certification.yml` and supports controlled manual reruns, `workflow_call`, and the `skillup-staging-deployed` repository-dispatch event.

Playwright certification uses zero retries and one worker. A critical test that passes only after retry is therefore never green. Trace and video are disabled for the sensitive certification suite; failure screenshots and sanitized JSON/HTML reports are retained.

## Gate zero: exact deployed identity

Web and API expose only safe release metadata:

- `releaseSha`;
- `pipelineId`;
- `artifactRef`;
- `imageDigest`;
- `rollbackRef`.

Deployment automation must set:

```text
RELEASE_SHA
RELEASE_PIPELINE_ID
RELEASE_ARTIFACT_REF
RELEASE_IMAGE_DIGEST
ROLLBACK_ARTIFACT_REF
```

Container builds also carry the source revision in the OCI `org.opencontainers.image.revision` label. Certification compares the running metadata with the deployment controller's expected SHA, pipeline, immutable artifact references and image digests before any browser test runs. Missing or mismatched identity is `BLOCKED`.

For the AI worker, the deployment controller supplies its safe running SHA, immutable artifact reference and image digest. Provider/platform deployment metadata is the authority for the worker because it is not exposed as a public browser endpoint.

## Protected GitHub `staging` environment

Configure these non-secret environment variables:

```text
STAGING_WEB_URL
STAGING_API_URL                         # optional when the direct API is intentionally private
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
STAGING_QA_FREE_LEARNER_EMAIL
STAGING_QA_ONBOARDING_EMAIL
STAGING_QA_AUTH_NEGATIVE_EMAIL
STAGING_QA_SESSION_EMAIL
STAGING_QA_ADMIN_EMAIL
STAGING_QA_ANALYST_EMAIL
STAGING_QA_CONTENT_EDITOR_EMAIL
STAGING_QA_CONTENT_REVIEWER_EMAIL
STAGING_QA_PUBLISHER_EMAIL
STAGING_QA_PAYMENT_OPERATOR_EMAIL
STAGING_QA_LEARNER_SUPPORT_EMAIL
STAGING_QA_SECURITY_ADMIN_EMAIL
STAGING_QA_REVOKED_ADMIN_EMAIL
STAGING_QA_MAILBOX_URL
```

Configure only this browser-certification secret in the GitHub environment:

```text
STAGING_QA_MAILBOX_TOKEN
```

DeepSeek, SMTP, JazzCash, database and session credentials belong in the staging runtime platform's protected secret store, not in the Playwright workflow. Readiness flags are assertions only; they never substitute for runtime/browser evidence.

## Staging-only identity matrix

All identities are named non-production accounts and authenticate through the real passwordless OTP flow. Administrative assignments use the existing audited role machinery.

- Premium learner: audited temporary Premium entitlement; used for full gameplay and Premium learner journeys.
- Free learner: no Premium entitlement; verifies free-tier authority and Admin denial.
- Onboarding learner: deterministic profile used for onboarding completion and recovery tests.
- Auth-negative learner: isolated identity for invalid/replayed OTP tests.
- Session learner: isolated identity for session revocation tests.
- Broad Admin: only the combined roles required for complete operational end-to-end AI/Admin certification.
- Analyst: read-only reporting identity.
- Content editor: `content_editor` only.
- Content reviewer: `content_reviewer` only.
- Publisher: `publisher` only.
- Payment operator: `payment_operator` only.
- Learner support: `learner_support` only.
- Security Admin: `security_admin` only.
- Revoked Admin: valid learner login with its previous Admin authority revoked/expired so stale browser state cannot grant access.

OTP setup requests use deterministic non-identifying certification user-agent fingerprints per account so one certification run does not trip the global IP/user-agent abuse limit. The application email-level rate limits remain unchanged.

## OTP mailbox contract

Certification tests real staging email delivery. `STAGING_QA_MAILBOX_URL` is a protected test-mailbox retrieval service called as:

```text
GET <mailbox-url>?email=<qa-email>&after=<ISO timestamp>
Authorization: Bearer <STAGING_QA_MAILBOX_TOKEN>
```

It returns only the latest matching staging code:

```json
{"code":"123456"}
```

The code is held in memory and never written to reports. This is mailbox retrieval, not an authentication bypass.

## Playwright coverage

### Runtime, public and PWA

- Web health metadata/security/no-store headers.
- API version/readiness and DB-backed preflight through the orchestrator.
- all five reviewed public skill paths and structured-data boundaries.
- private route authentication/no-store behavior.
- PWA manifest and offline route.
- refresh, back and forward navigation.
- uncaught page-error smoke on critical public pages.
- semantic landmark, labelled-control and keyboard-focus accessibility smoke.

### Passwordless authentication and sessions

- real OTP request/delivery/verification.
- invalid email validation.
- wrong OTP rejection.
- consumed OTP replay rejection.
- anonymous learner/Admin API denial.
- bounded sign-in network failure UX.
- current-session revocation and subsequent server-side 401.
- cleared/expired-style browser authentication redirect to sign-in.

### Onboarding, account and privacy

- onboarding completion and return-to handling.
- required-field validation.
- onboarding network failure with form-state preservation.
- active account/session visibility.
- privacy preference update and restoration through API and browser UI.
- private data export through API and browser download.
- deletion cooldown creation/cancellation through API and browser UI.
- untrusted-Origin mutation rejection.

### Learner/gameplay

- Premium capability authority.
- free-tier capability authority and no client-side tier escalation.
- all five launch entry levels.
- all seven challenge formats.
- replay-safe challenge submission/idempotency.
- repeated level start resumes one authoritative active session.
- unknown level and untrusted-Origin failures.
- level refresh recovery.
- desktop Chromium and Pixel-class mobile Chromium.
- mobile no-horizontal-overflow checks on progress, pricing and playable learning surfaces.

### Premium and commercial

- PKR 599 monthly and PKR 4,999 yearly authority.
- exactly the two approved launch plan codes/prices.
- replay-safe checkout order creation.
- provider checkout handoff structure.
- capability remains server-authoritative after checkout creation.
- Admin summary, payments, memberships, recurring customers, reconciliation, plans and export history.
- audited CSV export creation/download.
- invalid report range validation.
- trusted-Origin and plan-input validation.
- browser navigation/deep-link/refresh across all Premium Admin tabs.

Provider-specific JazzCash success, pending, failure, cancel, timeout, retry, duplicate callback, replay, amount mismatch, refund and reconciliation certification remains mandatory once the actual merchant sandbox contract/test instruments are available. Internal callback/order smokes are not a substitute. Until that provider test harness is configured, certification must report `BLOCKED — PAYMENT SANDBOX NOT CONFIGURED`.

### Admin role/capability matrix

Positive and negative authority is tested independently for:

- broad Admin operational flow;
- `analyst`;
- `content_editor`;
- `content_reviewer`;
- `publisher`;
- `payment_operator`;
- `learner_support`;
- `security_admin`;
- revoked Admin identity;
- ordinary free learner with no Admin assignment.

The suite verifies that publication authority does not imply payments, payment authority does not imply publication, analyst access remains read-only, learner-support data remains minimized, and revoked/non-Admin browser state cannot bypass API authorization.

### AI / DeepSeek

- bounded safe generation request tagged with the QA run identifier.
- PostgreSQL job claimed by the AI worker.
- configured staging provider execution.
- validated artifact observed through Admin API.
- human review approval.
- staging-only publication and rollback.
- expected DeepSeek provider assertion.
- invalid request validation.
- untrusted-Origin rejection.
- unknown cancellation/publication targets fail safely.

If AI is mandatory and DeepSeek or the worker is not configured, the result is `BLOCKED`, never skipped/pass.

### Visual regression

Human-approved `toHaveScreenshot` baselines cover stable public, authentication, learner progress/challenge/account, Admin shell and Premium Admin surfaces. Baselines are never updated automatically. Missing or changed approved baselines produce `VISUAL REVIEW REQUIRED` until a human reviews and commits the intentional result.

## Evidence and privacy

Each run writes:

- `artifacts/staging-certification/certification.json`;
- `artifacts/staging-certification/certification.md`;
- Playwright JSON and HTML reports;
- failure screenshots.

Authentication storage state is deleted before artifact upload. OTPs, cookies, session tokens, provider credentials and payment secrets must never appear in GitHub logs, reports or screenshots.

## Decision model

The orchestrator emits exactly one release decision:

- `READY FOR UAT` — every mandatory configured area passed.
- `FAILED` — a reproducible application/security/business failure exists.
- `BLOCKED` — exact identity, provider setup, fixtures or visual approval prevents a valid certification.

`FAILED` and `BLOCKED` exit non-zero. Human UAT remains a separate explicit approval. Production promotion is never automatic and must use the exact staging/UAT-approved artifacts without rebuilding.

## Permanent regression rule

Every new feature must add the appropriate unit/API/Playwright happy-path, negative, authorization, Admin/Premium/payment and responsive coverage. Every defect found in QA or UAT becomes a permanent regression test before the defect is considered closed.
