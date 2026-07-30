# SkillUp Platform

SkillUp is a Pakistan-first, mobile-first web platform that turns skill learning into an AI-powered game. Learners choose a skill, complete short generated levels and challenges, earn points, track progress, and share achievements.

This repository is the new production source of truth. The earlier QRK repositories may be inspected for reusable ideas, but no legacy code is promoted without security, licensing, architecture, and product-fit review.

## Product direction

- Primary audience: Pakistani learners, initially ages 16–30.
- First delivery surface: responsive web application and installable PWA. Native mobile apps are deferred.
- Business model: freemium with monthly and yearly premium plans.
- Initial premium pricing: PKR 599 monthly and PKR 4,999 yearly.
- Payment launch: JazzCash.
- Initial language: English, with Urdu-ready content, URL, data, and design architecture from the start.
- AI strategy: provider-agnostic model gateway with DeepSeek or the cheapest acceptable model selected by task, quality, latency, and cost policy.
- Discoverability: SEO, AEO, and GEO are product architecture requirements, not a later marketing add-on.

## Required experience

1. Discover a skill or learning resource through search, AI answers, social sharing, or direct navigation.
2. Register or continue as an eligible guest where allowed.
3. Select a skill and learning goal.
4. Play short, structured learning levels and varied challenge types.
5. Receive immediate feedback, explanations, points, streaks, and progress.
6. Continue through a personalized learning path.
7. Upgrade through JazzCash when premium value is clear.
8. Share achievements without exposing private learning data.

## Target repository structure

```text
apps/
  web/                 Next.js mobile-first web/PWA and public discovery pages
  api/                 Versioned application API and domain services
services/
  ai-worker/           Python generation, validation, and evaluation workers
packages/
  ui/                   Shared accessible design system
  contracts/            Versioned API and event contracts
  content-schema/       Skill, course, lesson, level, question, and translation schemas
  discoverability/      Metadata, structured data, sitemap, and content-quality utilities
  analytics/            Event taxonomy and privacy-safe tracking helpers
infra/                  Reproducible local, staging, and production infrastructure
content/                Reviewed seed content and content-source metadata
docs/                   Product, architecture, security, roadmap, and operating decisions
```

## Non-negotiable engineering principles

- Mobile performance, accessibility, security, and discoverability are acceptance criteria for every relevant feature.
- Public learning content must be server-rendered or statically generated, indexable, useful, original, and linked through a coherent information architecture.
- AI-generated material is schema-validated, quality-scored, versioned, traceable, and reviewable. It must not create thin programmatic pages for search manipulation.
- Payment, entitlement, identity, progress, and scoring decisions are authoritative on the server.
- Private user data, dashboards, payments, and personal progress are never indexed.
- Production releases use reviewed pull requests, required checks, immutable artifacts, staged verification, and documented rollback.

## Foundation documents

- [Product specification](docs/product/PRODUCT_SPEC.md)
- [Target architecture](docs/architecture/ARCHITECTURE.md)
- [SEO, AEO, and GEO standard](docs/discoverability/SEO_AEO_GEO_STANDARD.md)
- [Delivery roadmap](docs/roadmap/ROADMAP.md)
- [Security baseline](SECURITY.md)
- [Agent instructions](AGENTS.md)

## Current phase

The repository is in product and engineering foundation setup. Implementation begins only after the initial architecture, content model, analytics taxonomy, design system, and release gates are approved through the tracked GitHub epics and issues.