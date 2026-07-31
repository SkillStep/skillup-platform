# SkillUp Platform

SkillUp is a Pakistan-first, mobile-first web platform that turns practical skill learning into a structured AI-assisted game. Learners choose a skill, complete short levels and challenges, receive useful feedback, earn progress and achievements, and upgrade when premium value is clear.

This repository is the new production source of truth. Earlier QRK repositories may be inspected for reusable ideas, but no legacy code is promoted without security, licensing, architecture, dependency, test and product-fit review.

## Product direction

- Primary audience: Pakistani learners, initially ages 16–30.
- First delivery surface: responsive web application and installable PWA. Native mobile apps are deferred.
- Business model: freemium with monthly and yearly premium plans.
- Initial premium pricing: PKR 599 monthly and PKR 4,999 yearly.
- Payment launch: JazzCash.
- Initial language: English, with Urdu-ready content, URL, data and design architecture from the start.
- AI strategy: provider-agnostic gateway with DeepSeek as the economical primary candidate, Groq as an approved fallback candidate, OpenRouter free only for local/synthetic evaluation, and a deterministic offline adapter for CI.
- Discoverability: SEO, AEO and GEO are product architecture requirements, not a later marketing add-on.

## Repository structure

```text
apps/
  web/                  Next.js mobile-first web/PWA and public discovery pages
  api/                  Versioned application API and domain services
services/
  ai-worker/            Provider-neutral generation, validation, evaluation and durable queue
packages/
  ui/                   Shared accessible design system
  contracts/            Versioned API, event and job contracts
  content-schema/       Skill, path, lesson, level, challenge and translation schemas
  discoverability/      Metadata, structured data, sitemap and content-quality utilities
  analytics/            Event taxonomy and privacy-safe tracking helpers
infra/                  Reproducible local, staging and production infrastructure
content/                Reviewed seed content and content-source metadata
docs/                   Product, architecture, security, roadmap and operating decisions
```

## Non-negotiable engineering principles

- Mobile performance, accessibility, security and discoverability are acceptance criteria.
- AI-generated material is schema-validated, quality-scored, versioned, traceable and reviewable; it never publishes directly.
- Domain code never instantiates a provider SDK. Every task uses an approved prompt/schema/model/cost policy.
- Payment, entitlement, identity, progress and scoring decisions remain authoritative on the server.
- Private user data, dashboards, payments and personal progress are never indexed or placed in the public offline cache.
- Production releases use reviewed pull requests, required checks, immutable artifacts, staged verification and documented rollback.

## AI gateway

The AI worker is production-built but live generation remains fail-closed. It includes:

- DeepSeek, Groq and OpenRouter-compatible adapters through one dependency-free HTTP boundary;
- deterministic offline evaluation for every supported task;
- strict task input allowlists and output schemas;
- private-field rejection and PII redaction;
- idempotency, caching, bounded retries, timeouts, concurrency and circuit breakers;
- per-job, daily and monthly budget reservations;
- a durable priority queue with leases, cancellation and bounded attempts;
- privacy-safe usage metadata and traceability;
- a non-root production image and disabled-mode health smoke.

See [AI provider gateway](docs/ai/AI_PROVIDER_GATEWAY.md), [privacy and cost policy](docs/ai/AI_PRIVACY_AND_COST_POLICY.md), [model approval runbook](docs/ai/AI_MODEL_APPROVAL_RUNBOOK.md), and [worker operations](docs/ai/AI_WORKER_OPERATIONS.md).

## Engineering and operations

- [Target architecture](docs/architecture/ARCHITECTURE.md)
- [Delivery roadmap](docs/roadmap/ROADMAP.md)
- [Local development bootstrap](docs/engineering/LOCAL_DEVELOPMENT.md)
- [Railway staging deployment](docs/operations/RAILWAY_STAGING_DEPLOYMENT.md)
- [Production readiness](docs/operations/PRODUCTION_READINESS.md)
- [Security baseline](SECURITY.md)
- [Agent instructions](AGENTS.md)

## Local validation

```bash
corepack enable
corepack prepare pnpm@11.17.0 --activate
pnpm install --frozen-lockfile
pnpm local:setup
pnpm check
pnpm container:build
```

The quality pipeline validates locked dependencies, migrations, deterministic seed data, database constraints, formatting, linting, strict TypeScript, unit/integration/Python tests, deterministic AI evaluation, production builds, non-root API/web/AI-worker images, API/PostgreSQL smoke and production-like web/API smoke.

## Current phase

The executable beta includes public discovery, privacy-safe PWA, passwordless sessions, onboarding, reviewed learning content, server-authoritative gameplay/resume, progress/rewards, production operations, and a production-built provider-neutral AI worker. Live SMTP, live AI generation, provider credentials, final provider/model/task approval, premium, JazzCash, infrastructure and production traffic promotion remain separately gated.
