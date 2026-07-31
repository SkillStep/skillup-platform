# AI Worker Operations

## Runtime model

The first production worker is deliberately single-replica. Its queue, idempotency, cache and cost ledger use SQLite WAL on an encrypted persistent volume at `AI_BUDGET_DB_PATH`.

Required volume path in the container:

```text
/var/lib/skillup-ai/ai-gateway.sqlite3
```

Back up the SQLite database using the provider's volume snapshot or SQLite online backup procedure. A raw copy while the process is writing is not an approved backup.

## Scaling boundary

Before running more than one worker replica, migrate these tables to PostgreSQL:

- `ai_job_queue`
- `ai_usage_ledger`
- `ai_job_results`
- `ai_response_cache`

Use row locking with `FOR UPDATE SKIP LOCKED`, transaction-scoped budget reservation and unique idempotency constraints. Do not place SQLite on NFS or share the file across containers.

## Monitoring

Alert on:

- feature enabled with provider misconfiguration;
- daily or monthly budget above 80%;
- schema validation failures;
- circuit breaker opening;
- retry or fallback rate increases;
- queue age and failed jobs;
- redaction count spikes;
- provider model deprecation announcements;
- model price changes;
- unexpected cost per task;
- persistent volume capacity and backup failures.

## Incident actions

- Cost spike: disable the feature flag, stop the worker and inspect token/correlation metadata.
- Provider outage: keep drafts queued or pause processing; do not bypass the approved fallback policy.
- Privacy concern: disable the feature, revoke keys, preserve logs without content and follow the incident-response runbook.
- Malformed output increase: disable the affected task/model combination and rerun evaluation.
- Queue corruption: stop the worker, restore the last verified backup and reconcile correlation IDs before resuming.
