# Infrastructure

The MVP reference architecture uses reproducible containers, PostgreSQL, S3-compatible object storage, Cloudflare and Railway as documented in ADR 0005.

## Current executable infrastructure

- `compose.yaml` provides isolated local PostgreSQL.
- `docker/api.Dockerfile` builds the Fastify API as a non-root production OCI image.
- `docker/web.Dockerfile` builds the Next.js application as a non-root standalone production OCI image.
- `railway/api.railway.json` applies checked-in migrations before API traffic and gates on database-backed readiness.
- `railway/web.railway.json` gates web traffic on the bounded web health endpoint.
- `tools/validate-deployment.mjs` blocks unreviewed deployment-contract drift.
- `tools/smoke-live.mjs` verifies a deployed release without requiring learner credentials.

The queue, object-storage and AI-worker production containers remain disabled until their implementation issues are approved. JazzCash is not enabled.

## Runbooks

- [Railway staging deployment and live verification](../docs/operations/RAILWAY_STAGING_DEPLOYMENT.md)

## Rules

- no production secrets or environment-specific credentials;
- no direct production SSH editing;
- immutable artifacts and explicit release metadata;
- preview data is synthetic;
- database migrations, backups, health checks and rollback are release gates;
- production image tags must resolve to an immutable digest;
- staging success does not authorize production without the documented human approvals.
