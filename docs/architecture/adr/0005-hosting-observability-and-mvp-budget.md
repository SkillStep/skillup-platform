# ADR 0005 — Hosting, Observability and MVP Infrastructure Budget

- **Status:** Accepted as the provisional MVP reference architecture
- **Date:** 2026-07-30
- **Owners:** SkillUp engineering and operations
- **Related:** #16, #17

## Context

SkillUp needs a low-operations hosting path that supports preview, staging and production, container portability, server-rendered public pages, durable workers, managed PostgreSQL, private object storage and weekly rollback. The launch audience is in Pakistan, so mobile latency and reliability matter. The product should not lock core application behavior to one vendor.

## Decision

### Reference providers

- **Cloudflare:** DNS, TLS, CDN/cache, basic WAF/rate controls and R2 object storage.
- **Railway Pro:** container runtime for `web`, `api` and `ai-worker`, plus managed PostgreSQL for the MVP.
- **GitHub Actions:** validation, immutable image build, SBOM and release evidence.
- **Sentry-compatible error reporting plus OpenTelemetry:** application errors, traces and release markers. The code exports standard OpenTelemetry data so the backend can change later.

All applications are built as OCI containers and do not depend on Railway-specific runtime APIs. Object access uses the S3-compatible contract. Database schema is standard PostgreSQL.

### Environments

- **Preview:** pull-request web preview and synthetic/local services only. No production credentials or learner/payment data.
- **Staging:** production-like containers, isolated database/storage and payment sandbox.
- **Production:** protected environment with explicit approval, immutable image digests, migration gate and rollback target.

### Deployment flow

```text
Pull request
→ required checks
→ immutable images + SBOM
→ preview or staging deployment
→ smoke and contract verification
→ explicit production approval
→ promote exact image digests
→ post-deployment verification
→ release marker and evidence
```

### CDN and rendering

- Public pages are server-rendered or statically generated.
- Cache only explicitly public responses.
- Authenticated, payment and admin responses use private/no-store behavior.
- CDN cache keys never include raw session or private identifiers.
- Purges and revalidation are tied to reviewed content publication.

## Requirements

- No direct production source editing.
- One release is traceable from issue and PR to commit, image digest and deployed environment.
- Database migrations run once under a deployment lock.
- Previous known-good images remain deployable.
- Production secrets are environment-scoped and unavailable to pull requests.
- Services expose liveness, readiness and version endpoints.
- Backups and restore evidence exist before beta.
- DNS and CDN configuration can be exported or reproduced from code/documented settings.

## Alternatives considered

### AWS-first architecture

Operationally robust and regionally attractive, but rejected for the first MVP because ECS/RDS/networking/IAM add cost and operational burden before product validation. OCI images and PostgreSQL preserve a future AWS migration path.

### Vercel web plus a separate backend platform

Strong Next.js experience, but not selected as the initial default because it adds another vendor and can encourage framework-specific deployment coupling. It remains a valid fallback if measured Next.js delivery/performance is materially better.

### Single unmanaged VPS

Rejected for production because it concentrates database, application, backups, deployment and security risk and weakens rollback and access controls.

### Kubernetes

Rejected as unnecessary operational complexity for the MVP.

### Self-hosted object storage

Rejected for production. Local MinIO is an emulator, not the production durability strategy.

## Cost implications

Planning estimate for a small production beta, excluding AI-model usage, payment-provider fees, email/SMS and staff:

| Cost area | Initial monthly planning range |
|---|---:|
| Railway production services and PostgreSQL | USD 40–120 |
| Cloudflare DNS/CDN/WAF tier | USD 0–25 |
| R2 storage and operations | USD 0–15 |
| Error monitoring/uptime/log add-ons | USD 0–40 |
| Backup/export contingency | USD 10–25 |
| **Total planning range** | **USD 50–225/month** |

The working target is **USD 75–150/month** for the closed beta under modest traffic. This is a budget envelope, not a provider quote.

Current public pricing references:

- [Railway pricing](https://railway.com/pricing)
- [Railway pricing documentation](https://docs.railway.com/pricing/plans)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)

Set provider budget alerts and usage caps before production credentials are enabled.

## Observability decision

Every service emits:

- structured JSON logs;
- request/job correlation ID;
- release/commit identifier;
- latency and error metrics;
- OpenTelemetry traces for critical journeys;
- health/readiness/version state;
- domain events for payment, entitlement, AI jobs and content publication.

Redact:

- passwords, session tokens and reset tokens;
- JazzCash secrets and full callback payloads;
- unnecessary phone/email/profile data;
- private learner responses unless explicitly required for authorized support;
- raw model prompts containing personal or licensed content.

Initial alerts cover:

- elevated authentication failures or abuse;
- API error/latency thresholds;
- database connection/storage pressure;
- failed or stuck jobs;
- payment callback/reconciliation failures;
- entitlement mismatches;
- public-page availability and Core Web Vitals regression;
- AI cost or rejection spikes.

## Security implications

- Cloudflare is not the authorization boundary; applications enforce identity and object access.
- Railway and Cloudflare accounts require MFA and least-privilege team access.
- Production database is not publicly reachable except through approved provider controls.
- R2 buckets are private and presigned access is short-lived.
- Environment secrets are rotated and never printed in CI logs.
- Preview environments use synthetic data.

## Operational burden

The team manages multiple provider accounts, environment configuration, budget alerts, backups, DNS and incident runbooks. Keeping containers, PostgreSQL and S3 contracts portable reduces but does not eliminate migration work.

## Migration path

At higher scale or stronger regional/compliance requirements:

- move OCI services to AWS ECS/Fargate, another managed container platform or Kubernetes only when justified;
- migrate PostgreSQL through logical backup/restore or replication;
- migrate S3-compatible objects with checksums and a dual-read/cutover plan;
- preserve OpenTelemetry instrumentation while changing observability backends.

## Rollback and revisit triggers

Revisit when:

- Pakistan latency or availability fails the agreed user-experience budget;
- the provider lacks required region, backup, audit or access controls;
- monthly cost exceeds the budget envelope for two consecutive months without corresponding product growth;
- Next.js behavior is materially constrained by the container deployment;
- compliance or enterprise requirements demand a different region/provider contract;
- Railway or Cloudflare service terms materially change.

Rollback uses the previous image digest and compatible database state. An infrastructure incident must not trigger direct production editing or restoration of secrets into source.