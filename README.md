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
- AI strategy: provider-agnostic model gateway with DeepSeek or the cheapest acceptable model selected by task, quality, latency, privacy and cost policy.
- Discoverability: SEO, AEO and GEO are product architecture requirements, not a later marketing add-on.

## Required experience

1. Discover a skill or learning resource through search, AI answers, social sharing or direct navigation.
2. Register or continue as an eligible guest where allowed.
3. Select a skill and learning goal.
4. Play short, structured learning levels and varied challenge types.
5. Receive immediate feedback, explanations, points, streaks and progress.
6. Continue through a personalized learning path.
7. Upgrade through JazzCash when premium value is clear.
8. Share achievements without exposing private learning data.

## Repository structure

```text
apps/
  web/                  Next.js mobile-first web/PWA and public discovery pages
  api/                  Versioned application API and domain services
services/
  ai-worker/            Python generation, validation and evaluation workers
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

- Mobile performance, accessibility, security and discoverability are acceptance criteria for every relevant feature.
- Public learning content is server-rendered or statically generated, indexable, useful, original and linked through a coherent information architecture.
- AI-generated material is schema-validated, quality-scored, versioned, traceable and reviewable. It must not create thin programmatic pages for search manipulation.
- Payment, entitlement, identity, progress and scoring decisions are authoritative on the server.
- Private user data, dashboards, payments and personal progress are never indexed.
- Production releases use reviewed pull requests, required checks, immutable artifacts, staged verification and documented rollback.

## Product and brand foundation

- [Product specification](docs/product/PRODUCT_SPEC.md)
- [Pakistan launch brief and personas](docs/product/LAUNCH_BRIEF.md)
- [Initial skill catalog and content governance](docs/product/INITIAL_SKILL_CATALOG.md)
- [Freemium, premium and pilot KPIs](docs/product/FREEMIUM_PREMIUM_AND_KPIS.md)
- [Information architecture](docs/product/INFORMATION_ARCHITECTURE.md)
- [Brand system V1](docs/brand/BRAND_SYSTEM_V1.md)

## Engineering and operations

- [Target architecture](docs/architecture/ARCHITECTURE.md)
- [Architecture decisions](docs/architecture/adr/)
- [SEO, AEO and GEO standard](docs/discoverability/SEO_AEO_GEO_STANDARD.md)
- [Accessibility and performance standard](docs/design/DESIGN_ACCESSIBILITY_PERFORMANCE_STANDARD.md)
- [Delivery roadmap](docs/roadmap/ROADMAP.md)
- [Local development bootstrap](docs/engineering/LOCAL_DEVELOPMENT.md)
- [Railway staging deployment](docs/operations/RAILWAY_STAGING_DEPLOYMENT.md)
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

The quality pipeline validates locked dependencies, repository boundaries, migrations, deterministic seed data, database constraints, formatting, linting, strict TypeScript, unit and integration tests, Python tests, production application builds, production container builds and API/PostgreSQL startup smoke.

## Staging verification

After an authorized operator configures the isolated Railway staging project and secrets:

```bash
SKILLUP_WEB_URL=https://<staging-web-hostname> \
SKILLUP_EXPECTED_RELEASE_SHA=<deployed-git-commit-sha> \
pnpm smoke:live
```

The same check is available through the manually dispatched `Live Staging Smoke` GitHub Actions workflow.

## Current phase

The executable platform now includes the public mobile-first shell, secure passwordless session foundation, onboarding, versioned reviewed learning content, server-authoritative gameplay, exact-session recovery, progress, points, streaks, achievements, privacy-aware leaderboards and deployment-ready web/API containers. Real SMTP sign-in can be activated only with an approved sender account. JazzCash, live AI generation, production credentials, final legal/privacy approval, backups and production promotion remain separately gated work.
