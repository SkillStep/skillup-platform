# AI Privacy and Cost Policy

## Data boundary

AI providers may receive only the minimum fields approved for the named task. The gateway rejects unknown fields and prohibited key names, then redacts email addresses, phone numbers, bearer tokens and common secret formats before queue persistence or provider transmission.

Never send:

- email, phone, address, CNIC or display name;
- user, learner, session, cookie or IP identifiers;
- authentication secrets or provider keys;
- payment, merchant or card data;
- full private profiles or unrestricted progress histories;
- internal moderation notes;
- unpublished third-party material without documented rights.

Learner free text may be used only when the approved task requires it, after redaction, and only with a reviewed provider data policy. No raw prompt or model output is written to operational logs.

## Provider-data approval

Before enabling a provider, the privacy owner must document:

1. contracting entity and applicable terms;
2. data location, retention and model-training treatment;
3. deletion and incident process;
4. subprocessor and transfer position;
5. whether zero-data-retention or equivalent controls are enabled;
6. tasks and fields allowed for that provider;
7. learner notice or consent changes, if required.

Free tiers must not receive real learner data. Gemini free tier and OpenRouter free routing are development/evaluation options for synthetic or public fixtures only.

## Cost controls

Cost is enforced at four levels:

- model price table reviewed in code;
- task-specific maximum cost;
- global `AI_MAX_COST_USD_PER_JOB`;
- durable daily and monthly budgets.

A conservative maximum cost is reserved before a provider call. Failed requests retain their reservation for the budget period because an upstream provider may still bill partial work. Actual prompt, cached input and completion tokens replace the reservation after success.

Defaults:

```text
AI_MAX_COST_USD_PER_JOB=0.02
AI_DAILY_BUDGET_USD=5
AI_MONTHLY_BUDGET_USD=100
AI_MAX_CONCURRENCY=4
AI_MAX_RETRIES=2
AI_REQUEST_TIMEOUT_SECONDS=30
```

These are upper safety limits, not spending targets. Initial production limits should be reduced to the approved beta volume.

## Caching and idempotency

The cache key includes task, prompt version, provider, model, content version and sanitized input. Identical approved work can reuse a result without another provider charge. Correlation ID plus task is durable and idempotent; reuse with changed sanitized input is rejected.

## Logs and analytics

Operational events may include task, provider, model, prompt version, content version, correlation ID, input fingerprint, token counts, cost, latency, attempts, cache state, redaction count, provider request ID and release SHA.

Operational events must not include request content, model content, API keys or learner identity. The correlation ID must be random and must not embed a user ID or email.
