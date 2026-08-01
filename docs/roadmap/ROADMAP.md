# SkillUp Delivery Roadmap

**Operating model:** one canonical `main`, issue-driven delivery, reviewed pull requests, staging verification and production rollback evidence.

## Current status — 2026-08-01

| Milestone | Repository status | Remaining gate |
|---|---|---|
| M0 — Product, brand, catalog and commercial contract | Implemented baseline | final human brand/domain/legal approval where applicable |
| M1 — Monorepo, architecture, security and delivery | Repository-complete | GitHub environment/ruleset administration and deployed evidence |
| M2 — Web/PWA, identity, account and analytics foundation | Repository-complete | live SMTP and deployed device/accessibility acceptance |
| M3 — Learning, gameplay and gamification | Repository-complete | production-like staging acceptance across all paths/devices |
| M4 — SEO/AEO/GEO and localization readiness | Repository-complete | deployed structured-data, indexing and Core Web Vitals evidence |
| M5 — AI generation, adaptation and cost controls | Repository-complete | approved DeepSeek key/model/tasks/budgets and live evaluation |
| M6 — Premium, JazzCash and entitlements | Provider-independent code complete | merchant-specific sandbox/production integration and settlement evidence |
| M7 — Admin, content operations, moderation and reporting | Repository-complete | operator acceptance and independent access review |
| M8 — Staging, production readiness and release operations | In execution | infrastructure, secrets, monitoring, live testing, restore/rollback and rollout |

PR #88 is the repository-side launch implementation. Issues #70–#76 should be treated as implemented in source; their deployment-only acceptance evidence is consolidated under #77, #78 and the pre-deployment handoff. No legacy repository is an authorized deployment source.

## M0 — Product Reset, Brand, Research, and Domain

Outcome: one approved SkillUp product definition, Pakistan-first audience, brand direction, launch catalog, content governance, policy baseline and measurable MVP.

Implemented repository contract:

- Pakistan-first learners initially ages 16–30;
- SkillUp positioned as structured skill learning, not a generic chatbot;
- five-skill reviewed launch catalog;
- English-first and Urdu-ready architecture;
- meaningful freemium experience;
- PKR 599 monthly and PKR 4,999 yearly premium plans;
- JazzCash-first commercial boundary;
- privacy, policy, content review and KPI contracts.

External/human gates:

- final domain/social ownership;
- final legal/privacy/refund/support approval;
- ongoing learner research and experiments.

## M1 — Monorepo, Architecture, Security, and Delivery Foundation

Outcome: clean, reproducible and secure engineering foundation.

Implemented:

- Next.js web/PWA, Fastify API, PostgreSQL and Python AI worker monorepo;
- locked runtimes and dependencies;
- typed configuration and fail-closed providers;
- reviewed migrations and deterministic data;
- production non-root containers;
- Quality CI, secret scanning, dependency controls, release evidence and recovery tooling;
- Railway web/API/worker reference deployment contracts;
- organization repository and migration governance.

External gates:

- branch/environment protection and independent reviewers;
- infrastructure accounts, private networking, secrets and monitoring;
- deployed backup/restore and rollback evidence.

## M2 — Mobile-First Web/PWA, Identity, Profiles, and Discovery

Outcome: users can discover SkillUp, register securely, manage privacy/account controls and use an installable mobile-first application.

Implemented:

- public discovery and PWA;
- passwordless challenge/session lifecycle;
- onboarding, profile, privacy and consent controls;
- active session management;
- policy acceptance, export and deletion lifecycle;
- private/public index and cache boundaries;
- privacy-safe analytics taxonomy and storage.

External gates:

- approved SMTP provider and verified sender;
- deployed browser/device/accessibility/slow-network acceptance.

## M3 — Learning Engine, Content, Gameplay, and Gamification

Outcome: learners complete structured and measurable skill paths.

Implemented:

- five reviewed launch skills, 68 levels and 204 challenges;
- all seven challenge formats;
- versioned content and protected evaluation data;
- baseline/end assessments;
- server-authoritative scoring and idempotent submissions;
- session resume, hints, remediation and recommendations;
- progress, points, streaks, badges, achievements, sharing and leaderboards;
- short-response rubrics with confidence/evidence and manual-review fallback.

External gate: full production-like staging acceptance on the supported matrix.

## M4 — SEO, AEO, GEO, and Localization Readiness

Outcome: reviewed public content is useful, crawlable, structured and future-Urdu ready.

Implemented:

- skill, path, guide, question, comparison and glossary route families;
- server-rendered useful HTML;
- metadata, canonical, robots, sitemap, breadcrumbs and structured data;
- author/reviewer/source/freshness presentation;
- internal relationships and reporting entry points;
- tested English/future-Urdu locale, fallback, hreflang and RTL contracts;
- strict private-route and PWA cache exclusions.

External gates:

- deployed schema/index validation;
- Search Console/IndexNow configuration where approved;
- field Core Web Vitals and real-device evidence.

## M5 — AI Generation, Adaptation, Quality, and Cost Controls

Outcome: AI assists learning/content operations without weakening trust or authority.

Implemented:

- provider-neutral gateway and deterministic CI adapter;
- versioned tasks, prompts, schemas and evaluation fixtures;
- redaction, validation, quality, retry, fallback, circuit and cost controls;
- durable application job boundary and single-replica worker;
- cancellation, leases, retries and auditable result/artifact flow;
- deterministic recommendations and bounded short-response assistance;
- human review/publication boundary.

External gates:

- approved DeepSeek account/key/model/tasks;
- privacy terms and prohibited inputs;
- budget ceilings;
- persistent volume/backup;
- live quality, latency, cost and outage evaluation.

## M6 — Premium Plans, JazzCash, Entitlements, and Revenue Analytics

Outcome: verified payments grant the correct capabilities exactly once.

Implemented:

- versioned plans/prices;
- payment order and event state;
- entitlement ledger and capability projection;
- transactional free daily mission limit;
- expiry, refund, revocation, correction and reactivation boundaries;
- pending recovery and reconciliation jobs;
- checkout/account/support/admin views;
- commercial analytics;
- JazzCash adapter boundaries and fail-closed configuration.

External gates:

- merchant-specific field/signing/status/refund/settlement contract;
- sandbox and production credentials;
- full sandbox matrix and controlled production settlement evidence.

## M7 — Admin, Content Operations, Moderation, and Reporting

Outcome: trusted operators manage the platform without direct database editing.

Implemented:

- capability-based admin authorization;
- content governance, review, publication, scheduling, correction and rollback;
- AI request/review/publication controls;
- learner support and minimized account/commercial views;
- moderation/reporting controls;
- payment/entitlement reconciliation;
- analytics/reporting and privileged audit evidence.

External gates:

- named operators and least-privilege assignments;
- independent high-risk reviewer ownership;
- deployed operator acceptance.

## M8 — Staging, Production Readiness, and Weekly Release Operations

Outcome: SkillUp is observable, recoverable and safely releasable.

Repository-complete foundations:

- production containers and immutable release identity;
- migration/readiness and live-smoke tooling;
- security and production-readiness validators;
- backup/restore verification tooling;
- incident, access, observability, release and rollback runbooks;
- organization governance and external owner handoff.

Remaining execution:

- provision staging/production infrastructure;
- configure domains, secrets, SMTP, JazzCash and optional DeepSeek;
- configure monitoring, alerts and incident ownership;
- execute complete staging journeys, accessibility, browser/device, slow-network, security, abuse, load and provider-failure tests;
- demonstrate restore and artifact rollback;
- fix staging defects and produce the acceptance bundle;
- promote the same approved artifacts;
- run the closed beta, JazzCash pilot and controlled release train.

## Cross-cutting definition of done

Every change must preserve:

- explicit business and learner outcome;
- bounded scope and acceptance criteria;
- tests and validation commands;
- security, privacy, accessibility, performance and data requirements;
- SEO/AEO/GEO requirements for public content;
- analytics definitions and authoritative server outcomes;
- dependencies, rollout, monitoring and rollback;
- fail-closed external providers;
- human authority for secrets, production access, payments, public publication and risk acceptance.
