# SkillUp Product Specification

**Status:** Foundation baseline

## 1. Product vision

SkillUp is an AI-powered skill learning game for Pakistani learners. It converts a chosen skill into a structured path of short levels, varied challenges, immediate explanations, points, progress, and shareable achievements.

The product must feel like a learning platform with game mechanics—not a generic chatbot and not an endless AI-content feed.

## 2. Initial audience

Primary launch audience:

- Pakistani learners, initially ages 16–30;
- students, early-career professionals, freelancers, job seekers, and young people learning practical skills;
- users on mobile devices, including constrained networks and lower-cost Android phones;
- English-first users while the platform remains structurally ready for Urdu.

## 3. User outcomes

A successful learner can:

1. find a relevant skill or answer through conventional search, AI search, social sharing, or platform navigation;
2. understand what the skill path teaches before registration;
3. select a skill, goal, and level;
4. complete short learning challenges with immediate feedback;
5. see progress, strengths, gaps, points, streaks, and next steps;
6. return consistently without losing progress;
7. unlock premium value through a clear JazzCash purchase flow;
8. share an achievement without exposing private account data.

## 4. MVP scope

### 4.1 Public discovery

- Home and category discovery.
- Indexable skill, course/path, guide, question, glossary, and comparison pages.
- Search and filters.
- English URLs with Urdu-ready localization architecture.
- Structured metadata, internal linking, sitemaps, canonical rules, and answer-oriented page sections.

### 4.2 Identity and profiles

- Email/phone-compatible account model, with the final launch method selected during implementation.
- User profile, avatar, age-appropriate privacy defaults, preferences, and learning goals.
- Secure authentication, session management, account recovery, logout, and account deletion.
- Public sharing through generated achievement cards, not exposed private profiles by default.

### 4.3 Learning experience

- Skill selection and onboarding assessment.
- Structured learning path containing modules, lessons, levels, and challenges.
- Initial challenge types: multiple choice, true/false, ordering, matching, scenario selection, fill-in, and short response where reliable evaluation is possible.
- Explanation after each response.
- Retry and remediation path.
- Progress, points, streaks, badges, and leaderboard controls.
- Learning summary after each level and path segment.

### 4.4 AI generation

- Versioned generation templates and schemas.
- Provider-agnostic model gateway.
- DeepSeek or the cheapest acceptable model selected per task.
- Content generation, distractor generation, explanation generation, difficulty adaptation, and summarization.
- Automated validation, duplication detection, quality scoring, prohibited-content checks, and review states.
- Human review and controlled publishing for public/indexable content.
- Cost, latency, error, and model-version tracking.

### 4.5 Freemium and premium

Free experience may include:

- a limited number of levels or daily attempts;
- core game types;
- standard progress;
- selected avatars and achievements;
- ads only if approved later and implemented without damaging learning UX or performance.

Initial premium experience:

- no ads;
- detailed progress and learning insights;
- unlimited or materially expanded level access;
- advanced AI challenges;
- premium avatars and perks;
- monthly plan at PKR 599;
- yearly plan at PKR 4,999.

The MVP payment scope is monthly and yearly only.

### 4.6 JazzCash payment flow

1. User selects monthly or yearly premium.
2. Server creates a pending payment intent/order.
3. User completes JazzCash payment through the approved integration path.
4. Server verifies the provider callback/status independently of client claims.
5. A successful, idempotent transaction activates the entitlement.
6. Failed, cancelled, pending, duplicate, refunded, and expired states remain explicit.
7. Activation, renewal, expiry, cancellation, refund, and manual correction are audited.

Pilot measurements include conversion, premium activation, renewal, transaction volume, payment failure, and entitlement mismatch.

## 5. Admin and content operations

The administrative product must support:

- skills, categories, paths, modules, lessons, levels, questions, answers, explanations, media, translations, and publication states;
- AI-generation requests, quality results, review queues, approval, rejection, regeneration, and version history;
- learner-support lookup using least privilege;
- payment and entitlement reconciliation without exposing unnecessary payment data;
- moderation, report review, featured content, and leaderboard controls;
- dashboards for acquisition, activation, engagement, learning completion, retention, AI quality, AI cost, and premium conversion;
- complete audit history for privileged actions.

## 6. Discoverability as a product requirement

Every public content type must define:

- search intent and learner outcome;
- stable URL and canonical behavior;
- title, description, heading, summary, and direct-answer section;
- structured data where valid;
- internal links and breadcrumb location;
- author/reviewer and source metadata;
- language and translation relation;
- freshness and review policy;
- index/noindex decision;
- measurable discovery and conversion events.

SEO, AEO, and GEO must be tested during feature delivery rather than applied after launch.

## 7. Non-functional requirements

### Performance

- Mobile-first loading and interaction budgets.
- Core Web Vitals targets: LCP at or below 2.5 seconds, INP below 200 milliseconds, and CLS below 0.1 at the 75th percentile.
- Route-level JavaScript, image, font, API, and AI-latency budgets.
- Graceful degraded behavior on slow connections.

### Accessibility

- WCAG 2.2 AA target.
- Keyboard, screen-reader, focus, contrast, reduced-motion, non-color status, and readable-language requirements.

### Security and privacy

- Server-authoritative identity, payments, entitlements, progress, scoring, and roles.
- Least privilege and auditable admin actions.
- No secrets or private data in source, client bundles, logs, prompts, analytics, or indexable pages.
- Rate limits, abuse controls, upload validation, dependency scanning, secret scanning, secure headers, and tested recovery.

### Reliability

- Idempotent payment, progress, reward, generation, and publication operations.
- Durable background jobs with retries and explicit failure states.
- Health, readiness, metrics, structured logs, release identifiers, backups, and rollback.

## 8. Explicit non-goals for the first release

- Native iOS or Android applications.
- A broad marketplace of external instructors.
- User-generated public courses without moderation and review controls.
- Unbounded AI chat as the primary learning interface.
- Mass-generated indexable pages.
- More payment providers before JazzCash is stable and measurable.
- Monthly plan variants beyond PKR 599 and yearly PKR 4,999.

## 9. MVP success measures

- Public pages are indexable, fast, and discoverable.
- Users reach a first completed level quickly.
- Learners return and continue a path.
- AI-generated levels meet an approved quality threshold.
- AI cost per completed learning session remains within a defined budget.
- JazzCash payments activate the correct entitlement reliably.
- Premium conversion and renewal can be measured end-to-end.
- Security, privacy, accessibility, and release gates pass before production.