# Observability

## Structured logs

Every service log should include timestamp, severity, service, environment, release SHA, request ID and bounded event name. Authentication, learner, content and reward identifiers may be recorded only when required for diagnosis; email, names, cookies, tokens, verification codes, raw answers and secrets must be redacted.

## Required signals

- web/API health and database-backed readiness;
- request rate, error rate and latency by bounded route template;
- authentication challenge and verification success/failure rates;
- level start, resume, completion and submission failure rates;
- reward-ledger and progress consistency failures;
- database connection saturation and migration failure;
- deployment and rollback release markers;
- Core Web Vitals after real traffic is available.

## Alerts

Critical alerts must state the condition, threshold, affected service, release SHA, first response action and named owner. Alert payloads must not contain secrets or unnecessary personal data. Before launch, test delivery for readiness failure, elevated 5xx responses, authentication failure spike and backup failure.

## Dashboards and retention

Dashboards must distinguish environment and release. Retention, access and deletion follow the approved privacy and incident policies. Monitoring must degrade safely: an unavailable telemetry provider must not block learner requests or expose buffered private data.
