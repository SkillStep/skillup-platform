# SkillUp Delivery Roadmap

**Operating model:** one canonical `main`, issue-driven delivery, small reviewed pull requests, staging verification, and production rollback evidence.

The roadmap uses GitHub epic issues as milestone trackers. Native GitHub milestones may be added administratively later without changing scope.

## M0 — Product Reset, Brand, Research, and Domain

Outcome: one approved SkillUp product definition, audience, brand direction, initial skill catalog, content governance, legal/privacy baseline, and measurable MVP.

Key work:

- confirm product naming, domain, brand system, and Pakistan-first positioning;
- research initial learner personas, devices, network constraints, and priority skills;
- define first skill catalog and editorial owners;
- approve free/premium boundaries and PKR 599 monthly / PKR 4,999 yearly pricing;
- define privacy, terms, age handling, content safety, and support policies;
- define MVP KPIs and experimentation guardrails.

Exit:

- product brief and initial information architecture approved;
- no unresolved contradiction in audience, monetization, language, or MVP scope;
- initial content and UX research backlog is implementation-ready.

## M1 — Monorepo, Architecture, Security, and Delivery Foundation

Outcome: clean, reproducible engineering foundation that can release safely.

Key work:

- create monorepo structure and ADRs;
- set runtime/package-manager versions and locked dependencies;
- establish Next.js web/PWA, API contract, PostgreSQL, AI worker, and local stack;
- add design tokens and accessible component foundation;
- add GitHub Actions for format, lint, type, tests, contracts, security, accessibility, discoverability, and production build;
- configure branch protection, environments, secret handling, observability baseline, migrations, backup, and rollback procedures;
- establish authentication and authorization architecture.

Exit:

- clean checkout to validated build succeeds;
- required checks block unsafe merges;
- staging artifact is traceable and reversible;
- no secret or environment-specific credential is tracked.

## M2 — Mobile-First Web/PWA, Identity, Profiles, and Discovery Shell

Outcome: users can discover SkillUp, register securely, manage a profile, and use a fast installable mobile-first shell.

Key work:

- public home, categories, skill pages, navigation, search shell, and share metadata;
- authentication, recovery, sessions, consent, account deletion, and privacy defaults;
- profile, avatar, preferences, learning goals, and onboarding;
- PWA manifest, offline/error boundaries, responsive navigation, accessibility, and slow-network behavior;
- base analytics taxonomy and consent-aware event delivery;
- private/public route index controls.

Exit:

- first public routes pass accessibility, performance, and discoverability gates;
- account lifecycle works safely end-to-end;
- private pages cannot be indexed.

## M3 — Learning Engine, Content Model, Gameplay, and Gamification

Outcome: a learner can select a skill and complete a structured, rewarding learning path.

Key work:

- skill/path/module/lesson/level/challenge schemas and versioning;
- enrollment and onboarding assessment;
- challenge renderer and server-authoritative evaluation;
- multiple choice, true/false, ordering, matching, scenario, fill-in, and approved short-response evaluation;
- progress, attempt history, remediation, summaries, points ledger, streaks, badges, achievements, and privacy-aware leaderboards;
- reviewed seed content and editorial workflow;
- accessibility and low-bandwidth gameplay.

Exit:

- complete first-skill path can be played and resumed;
- scoring and rewards are idempotent and auditable;
- exact content versions are preserved with attempts;
- learning outcomes and quality are measurable.

## M4 — SEO, AEO, GEO, and Bilingual Discoverability

Outcome: discoverability is implemented as a reusable platform capability across every public content type.

Key work:

- public content families, stable localized URLs, server rendering, canonical rules, robots, redirects, sitemaps, breadcrumbs, and internal-link graph;
- reusable metadata and JSON-LD generators;
- `Course`, `LearningResource`, `Organization`, `WebSite`, `BreadcrumbList`, `Person`, and valid media schema where applicable;
- direct-answer, summary, source, author/reviewer, related-question, and freshness fields in the CMS/content model;
- Urdu-ready translation records, `hreflang`, language navigation, and editorial workflow;
- Search Console, index monitoring, Core Web Vitals, AI referral/citation tracking where available, and conversion attribution;
- automated discoverability and content-quality gates.

Exit:

- public route families pass the standard in `SEO_AEO_GEO_STANDARD.md`;
- no mass-generated thin pages exist;
- discovery-to-registration and discovery-to-learning conversion are measurable.

## M5 — AI Generation, Adaptation, Quality, and Cost Controls

Outcome: AI efficiently creates and adapts useful learning material without sacrificing trust, safety, or cost control.

Key work:

- provider-agnostic model gateway with DeepSeek as the initial economical candidate where suitable;
- generation templates, schemas, prompt versions, source references, and deterministic validation;
- content, question, distractor, explanation, summary, difficulty, and translation tasks;
- quality evaluation, duplication detection, safety policy, confidence, review queue, and publication controls;
- adaptive next-level recommendations using bounded, explainable inputs;
- model routing, token ceilings, caching, batch policies, fallbacks, circuit breakers, and cost dashboards;
- offline fixtures and deterministic test adapter.

Exit:

- approved quality threshold and maximum cost per generated/played level are enforced;
- model failure cannot corrupt progress or publish invalid content;
- every artifact is traceable to input, model, prompt, and review decision.

## M6 — Premium Plans, JazzCash, Entitlements, and Revenue Analytics

Outcome: users can purchase monthly or yearly premium and receive correct benefits reliably.

Key work:

- plans, prices, payment orders, transaction state machine, entitlement ledger, and reconciliation;
- PKR 599 monthly and PKR 4,999 yearly offer presentation;
- approved JazzCash integration, signed callbacks/status verification, idempotency, expiry, failure, retry, refund, and manual reconciliation;
- premium limits and benefit enforcement on the server;
- checkout UX, payment status, receipts/reference display, support path, and privacy-safe analytics;
- conversion, activation, renewal, expiry, failure, refund, and entitlement mismatch reporting.

Exit:

- successful payment activates exactly one correct entitlement;
- failed or duplicate callbacks cannot create access;
- reconciliation and recovery are documented and tested;
- 60–90 day pilot metrics can be produced.

## M7 — Admin, Content Operations, Moderation, and Analytics

Outcome: trusted operators can safely manage content, AI quality, users, payments, and platform performance.

Key work:

- capability-based admin authorization and privileged audit events;
- content editor, versioning, translation, review, approval, scheduling, publication, archive, and rollback;
- AI generation and quality review queues;
- learner support with least-privilege data access;
- payment/entitlement reconciliation and reasoned manual corrections;
- leaderboard and sharing moderation;
- product, learning, retention, discoverability, AI cost/quality, and revenue dashboards;
- export permissions and data-retention tools.

Exit:

- changing client state cannot grant privilege;
- every material admin action is authorized and audited;
- public content can be corrected and rolled back without rewriting learner history.

## M8 — Beta, Production Readiness, and Weekly Release Operations

Outcome: SkillUp is production-ready, observable, supportable, and capable of regular safe releases.

Key work:

- end-to-end regression suite across discovery, account, learning, AI, payment, and admin flows;
- security testing, threat-model closure, dependency remediation, load and abuse tests;
- accessibility audit, device/browser matrix, Core Web Vitals field validation, and low-bandwidth testing;
- data migration/seed controls, backup restore, disaster recovery, and payment reconciliation drill;
- production deployment, monitoring, alerts, support runbooks, incident response, privacy operations, and release evidence;
- closed beta, measured pilot, defect triage, and staged public launch;
- three consecutive controlled weekly releases.

Exit:

- no unresolved P0/P1 release blocker;
- rollback and restore have been demonstrated;
- critical journeys have alerts and owners;
- support, privacy, payment, and content operations are documented;
- weekly delivery does not require direct production editing.

## Cross-cutting definition of done

Every implementation issue must include:

- business and learner outcome;
- explicit in-scope/out-of-scope boundaries;
- acceptance criteria;
- tests and validation commands;
- security, privacy, accessibility, performance, and data requirements;
- SEO/AEO/GEO requirements for public content;
- analytics events and success measures;
- dependencies, rollout, monitoring, and rollback;
- AI execution boundary for autonomous implementation tools.