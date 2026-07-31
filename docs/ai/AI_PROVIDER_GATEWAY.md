# AI Provider Gateway

## Status

The gateway is production-ready but remains fail-closed. `FEATURE_AI_GENERATION_ENABLED=false` and `AI_PROVIDER=disabled` are the default and required pre-deployment state until provider credentials, data-sharing approval, live evaluation evidence, and task-level model approval exist.

## Architecture

All AI use flows through `skillup_ai_worker.AiGateway`. Domain code must never instantiate a provider SDK or call a model endpoint directly.

```text
reviewed task request
  -> task policy and schema
  -> field allow-list and PII/secret redaction
  -> idempotency and response cache
  -> per-job/daily/monthly budget reservation
  -> concurrency gate and circuit breaker
  -> DeepSeek / Groq / OpenRouter-compatible adapter
  -> strict JSON parsing and task output validation
  -> durable usage/result ledger
  -> privacy-safe structured operational event
  -> draft artifact for human review
```

The initial adapter uses Python's standard library and the OpenAI-compatible Chat Completions protocol. No vendor SDK is installed. Provider changes therefore remain configuration and policy changes rather than domain rewrites.

## Approved providers

| Provider | Approved use | Default model | Production status |
|---|---|---|---|
| DeepSeek | Primary generation, explanation, translation and review | `deepseek-v4-flash`; `deepseek-v4-pro` for quality review | Candidate pending live evaluation and human approval |
| Groq | Low-latency fallback | `openai/gpt-oss-20b`; `openai/gpt-oss-120b` for review | Candidate pending live evaluation and data-policy approval |
| OpenRouter | Free local evaluation and non-sensitive development fixtures | `openrouter/free` | Explicitly blocked in staging and production |
| Deterministic | CI, unit tests and contract evaluation | `deterministic-v1` | Explicitly blocked in staging and production |
| Disabled | Default safe state | none | Required until launch gates pass |

Provider and model pricing in `policies.py` was reviewed on 2026-07-31 against:

- DeepSeek: `https://api-docs.deepseek.com/quick_start/pricing/`
- Groq: `https://console.groq.com/docs/models`
- OpenRouter free router: `https://openrouter.ai/openrouter/free`

Prices can change. A price or model change requires a reviewed pull request and a new evaluation report.

## Approved task registry

- `generate_level`
- `generate_distractors`
- `generate_explanation`
- `summarize`
- `difficulty_classification`
- `translate_content`
- `quality_review`

Each task has a versioned prompt, input field allow-list, required fields, input/output limits, temperature, timeout, retry ceiling, cache TTL, cost ceiling, thinking policy, provider-specific model, and strict output validator.

## Failure boundaries

- An unknown task is rejected.
- AI is rejected when the feature flag is disabled.
- Production rejects deterministic and free-router models.
- Missing credentials or unsafe HTTP endpoints fail startup configuration.
- Malformed JSON, extra output fields, empty output, timeouts, rate limits and provider failures are typed failures.
- Provider output cannot update content, learner progress, scoring, payments or publication state directly.
- Quality review output is advisory and cannot approve or publish content.
- A repeated correlation ID is idempotent and cannot be reused with different sanitized input.

## Queue and worker

The initial worker has a durable priority queue with leases, bounded attempts, cancellation and expired-lease recovery. Queue payloads are sanitized before persistence. The SQLite database must be mounted on encrypted persistent storage and the worker must run as one replica.

Before horizontal scaling, move the queue, usage ledger, idempotency records and response cache to the existing PostgreSQL platform database. Multiple replicas must not share an SQLite file over a network filesystem.

## Container

`infra/docker/ai-worker.Dockerfile` runs Python as an unprivileged user. It contains no provider credentials and writes only to `/var/lib/skillup-ai`, which must be a protected persistent volume.
