# Application API

Target: TypeScript Fastify service with versioned REST endpoints and authoritative OpenAPI contracts.

Responsibilities:

- identity, sessions, roles and capabilities;
- catalog and published-content reads;
- enrollment, attempts, scoring, progress and rewards;
- plans, payments, reconciliation and entitlements;
- AI job creation and artifact/review coordination;
- administration, audit and analytics event intake;
- health, readiness and release metadata.

The API is the server authority for permissions, scoring, progress, payment and entitlement state. It must not trust client-supplied user IDs, roles, answers, prices or transaction outcomes.

Scaffolding the executable Fastify package, OpenAPI generation and database adapter remains part of issues #15 and #16.