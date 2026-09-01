# SkillUp Production Deployment

Production promotion is deliberately separate from staging deployment and provider activation.

## Invariants

- Only a full 40-character commit SHA with `staging-certification/live=success` is eligible.
- Promotion consumes the exact `staging-deployment-identity` artifact from a successful `Staging Deploy` run for that SHA.
- Web, API and AI-worker images are promoted without rebuilding; registry digests must still equal the staging-certified SHA256 digests.
- Production is a protected GitHub environment and must have named human approvers before the workflow is authorized for use.
- The production hostname must be HTTPS and must not reuse the staging hostname.
- Production PostgreSQL is managed externally. The application compose file intentionally contains no database container.
- Provider flags and credentials are never enabled by the promotion workflow. JazzCash, AI and Premium activation remain separately approved operating decisions.
- Database restoration is never automatic. Prefer forward-compatible migrations and application rollback.

## GitHub production environment

Create an environment named `production` and configure required reviewers before any promotion.

Required environment variable:

- `PRODUCTION_PUBLIC_URL` — canonical HTTPS production origin.

Required environment secrets:

- `PRODUCTION_HOST`
- `PRODUCTION_SSH_USER`
- `PRODUCTION_SSH_KEY`

Do not place these values in issues, pull requests, workflow inputs or evidence artifacts.

## Production host contract

The host must provide Docker Engine, the Compose plugin, Python 3, outbound GHCR access and a TLS/reverse-proxy edge that forwards the approved production origin to the loopback-bound web service.

Create `/opt/skillup-production/.env` with mode `0600`. It must contain production-only values for at least:

- `DATABASE_URL`
- `SESSION_SECRET`
- `EMAIL_PROVIDER`
- `FEATURE_PREMIUM_ENABLED`
- `FEATURE_JAZZCASH_ENABLED`
- `FEATURE_AI_GENERATION_ENABLED`

Add the remaining SMTP, object storage, monitoring, AI and payment settings only after their owners approve them. Staging secrets must not be reused.

## Production database prerequisites

Before first promotion:

1. create the production PostgreSQL service with private network access;
2. enable encrypted provider-managed daily backups and point-in-time recovery where supported;
3. record database/backup owner and recovery contact;
4. complete an isolated restore drill and preserve sanitized evidence;
5. verify the release migration set is forward-compatible with the planned rollback artifact.

The production workflow runs only checked-in forward migrations. It does not run QA fixtures or deterministic staging identities.

## Promotion procedure

1. Freeze the candidate SHA after UAT acceptance.
2. Confirm its `staging-certification/live=success` status.
3. Record the successful `Staging Deploy` run ID and attempt containing the exact deployment identity artifact.
4. Confirm no unresolved P0/P1 defects and that deployment, rollback, database, monitoring and incident owners are active.
5. Confirm backup/restore evidence and production TLS/DNS readiness.
6. Dispatch `Production Promotion` with the exact SHA, staging run ID/attempt and authorization phrase `PROMOTE-CERTIFIED-STAGING-ARTIFACTS`.
7. Approve the protected `production` environment deployment only after reviewing the candidate evidence.
8. The workflow verifies source status/run/artifact/digests, applies reviewed migrations, starts the exact images, verifies local readiness, checks the public TLS edge and writes sanitized promotion evidence.

A failed preflight must not be bypassed by retagging, rebuilding or editing the production host manually.

## Provider activation after base promotion

Base promotion alone does not authorize provider traffic.

### Email OTP

Enable only after production sender-domain/SPF/DKIM/DMARC ownership, credentials, abuse limits, bounce/complaint monitoring and controlled OTP approval are recorded.

### AI

Enable only after production provider key, model/task approval, privacy terms, cost ceilings, worker secret/storage, alert ownership and a controlled live DeepSeek operation are approved.

### Premium and JazzCash

Premium capability may be enabled only with approved pricing/benefit/refund/support copy. JazzCash additionally requires merchant-specific production credentials/contracts, callback/security rules, sandbox matrix evidence and approval for a controlled production transaction plus settlement/reconciliation verification.

## Gradual traffic opening

After controlled OTP/AI/JazzCash checks that apply to the launch scope, open traffic gradually:

1. internal operators;
2. controlled beta cohort;
3. limited public traffic;
4. full traffic after stable monitoring and reconciliation.

Stop promotion or traffic expansion on release identity mismatch, readiness failure, payment/entitlement mismatch, private-data cache/index exposure, unowned critical alerts, backup/rollback unavailability or any unresolved P0/P1 security/privacy/payment/accessibility/data-integrity defect.

## Rollback

Record the previous known-good immutable release before promotion. If rollback is required:

1. stop traffic expansion and provider activation;
2. confirm database compatibility with the previous release;
3. use the previous immutable image identities through the approved deployment path;
4. run health/readiness/release-identity and critical journey checks;
5. keep database restoration separate and require an explicit incident decision.

See `RELEASE_ROLLBACK.md`, `BACKUP_RESTORE.md`, `PRODUCTION_READINESS.md` and issue #87 for the remaining owner/provider handoff.
