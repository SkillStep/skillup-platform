# ADR 0004 — Durable Jobs, Object Storage and AI Execution

- **Status:** Accepted for MVP foundation
- **Date:** 2026-07-30
- **Owners:** SkillUp engineering, security and content operations
- **Related:** #16, #27, #28, #29

## Context

AI generation, content evaluation, payment reconciliation and media processing must survive restarts, support retries and remain auditable. The MVP should avoid unnecessary infrastructure while preserving a migration path as volume grows.

## Decision

### Durable job model

Use PostgreSQL as the initial durable job store.

A versioned `job` table records:

- job type and schema version;
- immutable input reference and input hash;
- tenant/account/content scope where applicable;
- idempotency key;
- priority and not-before time;
- status: queued, claimed, running, retrying, succeeded, failed, cancelled or dead-lettered;
- attempt count and maximum attempts;
- lease owner and lease expiry;
- progress and structured failure code;
- result/artifact references;
- creation, start, completion and cancellation timestamps.

Workers claim jobs through a short transaction using `FOR UPDATE SKIP LOCKED`. Leases allow recovery when a worker dies. Every handler must be safe to retry or must record its external side effect before acknowledging completion.

### Worker boundaries

- TypeScript workers handle application-domain jobs where shared transactions matter.
- The Python AI worker handles model generation, evaluation and approved media/ML tasks.
- Workers communicate through versioned job and artifact contracts, not ad hoc shared objects.
- Payment callbacks are accepted quickly and reconciled through durable application jobs.

### Distributed locking

Use PostgreSQL advisory locks or unique/idempotency constraints for the MVP. Add Redis/Valkey only when measured load or latency shows PostgreSQL is insufficient.

### Object storage

Use an S3-compatible private object store.

- All objects are private by default.
- Browser upload/download uses short-lived, scoped presigned URLs only after authorization.
- Object keys use generated identifiers, not raw user filenames or personal data.
- Store SHA-256, MIME/type validation result, size, owner/scope, retention class and encryption metadata.
- Public learning media is published through a separate reviewed publication record and CDN path.
- Temporary AI inputs and outputs use explicit expiry and cleanup jobs.

For local development, MinIO may emulate S3 behavior. Production code depends only on the S3-compatible contract.

### AI gateway

The Python worker calls models only through a provider-agnostic gateway contract.

Each task policy defines:

- purpose;
- permitted providers/models;
- prompt/template version;
- maximum input and output tokens;
- timeout;
- retry policy;
- temperature and deterministic settings;
- cost ceiling;
- expected JSON schema;
- source/reference requirements;
- safety and quality checks;
- publication/review policy.

DeepSeek is the initial economical candidate where quality, privacy and availability are acceptable. No domain service imports a provider SDK directly.

## Requirements

- Job state survives process and deployment restarts.
- Duplicate submission with one idempotency key does not create duplicate effects.
- Payment and entitlement side effects are exactly-once from the business perspective, even when transport is at-least-once.
- Cancellation is cooperative and explicit.
- Dead-lettered jobs remain inspectable and recoverable through authorized operations.
- AI output cannot directly publish content or alter learner/payment/permission state.
- Storage access is authorized at request time and expires automatically.

## Alternatives considered

### Redis/BullMQ plus Celery

Rejected for the initial cross-language queue because it creates two different worker frameworks and adds infrastructure before measured need.

### RabbitMQ

Operationally capable but unnecessary for MVP volume and adds broker management, routing and failure modes.

### Managed cloud queue first

Not selected because it couples local/production behavior to one cloud provider. A managed queue may replace the PostgreSQL implementation behind the same job contract later.

### Synchronous AI generation in HTTP requests

Rejected because model calls are slow, failure-prone and expensive. They must not hold learner or admin requests open indefinitely.

### Public buckets

Rejected. Public assets are deliberate publications, not a storage-default setting.

## Cost implications

The MVP reuses managed PostgreSQL instead of paying for a separate queue/cache service. Object-storage cost is usage-based. AI cost is controlled by task policy, caching, reusable approved artifacts and token ceilings.

A separate queue or cache service is added only when monitoring shows a measurable need, such as sustained claim contention, high-frequency rate limiting or latency-sensitive cache usage.

## Security implications

- Untrusted inputs never choose arbitrary model, tool, URL, bucket or object key.
- Workers run with least-privilege database and storage identities.
- Private content is not included in logs or model telemetry.
- Uploads receive MIME/magic-byte, size and malware controls before use.
- Presigned URLs are short-lived and scope one object/action.
- Job payloads contain references rather than large sensitive blobs.
- Prompt injection cannot change system policy, tool access, publication, payment or authorization.

## Operational burden

The team must maintain job cleanup, lease recovery, retry policies, dead-letter review, object retention and cost dashboards. The admin application needs safe visibility without exposing raw private model inputs.

## Migration path

If PostgreSQL job throughput becomes insufficient, introduce a managed queue or Redis/Valkey adapter while retaining:

- the authoritative job record;
- idempotency contract;
- artifact schema;
- handler behavior;
- audit and monitoring fields.

Existing queued jobs can be drained before cutover or republished through a controlled migration.

## Rollback and revisit triggers

Revisit when:

- queue activity materially affects transactional database performance;
- multiple regions or very high concurrency are required;
- object-storage provider limitations affect latency, compliance or cost;
- DeepSeek quality, policy, availability or price no longer meets task thresholds;
- model-provider data handling is incompatible with approved privacy requirements.

Rollback disables affected job types through configuration, drains or pauses queues, and preserves job/artifact history. It must not fall back to synchronous unbounded model calls or public storage.