# SkillUp AI-first course expansion — implementation roadmap

**Status:** Proposal and implementation backlog only, 12 November 2026. Not a publication approval.
**Repository baseline audited:** `71d97a4206eacc9594cbbc804b391aa77dec37d4`.
**Commercial baseline:** Premium monthly PKR 990 as configured. Do not change checkout, renewal, trial or production pricing in this programme without product and payment approval.
**Interpretation of AIFS:** AI-first content production and engineering, with mandatory human educational and editorial approval.

## Outcome and non-negotiable definition of value

Grow the current 5 skills into **20 genuinely playable courses** by adding 15 paths in three waves of 5. Each new course targets 4 modules × 6 levels = **24 levels**, at least 3 subject-specific challenges per level, baseline/end assessment and a tangible project. This adds **360 planned levels, at least 1,080 challenge interactions and 15 capstone projects**. Together with the existing 68 curriculum levels, the planned catalogue totals 428 levels. Targets are not publication claims.

A subscriber should complete something useful: spreadsheet, CV, design portfolio, content calendar, customer-support playbook, short video, dashboard, small website, etc. Course quality and successful Premium access are more important than the apparent number of cards.

### Existing technical baseline, verified in code

| Area | Current state | Implementation consequence |
| --- | --- | --- |
| `packages/database/src/complete-launch-curriculum.ts` | 5 paths, 68 curriculum levels | Preserve identifiers and existing learner attempts; improve existing levels rather than deleting them |
| `packages/database/src/complete-launch-challenges.ts` | 3 format-rotated, substantially generic challenges per level | **P0 quality issue**: replace repetitive content with subject-specific scenarios and answer logic |
| `packages/database/src/complete-launch-seed-v2.ts` | Deterministically creates and publishes launch content; uses a fixed historical reviewed date | Do **not** pipe AI drafts directly into this auto-publishing flow or invent review attestations |
| `apps/web/lib/public-catalog.ts` and `apps/web/lib/home-content.ts` | Curated client-facing 5-course projection | Replace duplicated catalogue data with a protected, published-only server projection |
| `apps/web/app/mainLanding/page.tsx` | Separate hardcoded promotional course categories | Link to the same authoritative catalogue and show only truthful availability |
| `apps/api/src/admin.ts` / `apps/api/src/content-operations.ts` | AI request/review/publish API and admin content operations exist | Extend existing roles, audit and immutable-version mechanisms; do not create a parallel unaudited publisher |
| `apps/api/src/gameplay.ts` | Server-authoritative level sessions, challenge evaluation | Reuse all supported formats, progress history and capability checks |
| `docs/product/FREEMIUM_PREMIUM_AND_KPIS.md` | Meaningful free plan, Premium depth, billing safeguards | Preserve free 3-mission rule and existing subscription behavior until separate approval |

Older scope issues #69, #70, #75 and #74 remain useful references, but the expansion has a new scope and must not be marked done merely because those historical issues are closed.

## Content manifest and priorities

The draft-only machine-readable backlog is `docs/product/course-expansion/catalog-plan-v1.json`. It defines all 15 new courses, stable proposed slugs, learning outcomes, audience, capstones, category, review cadence, and 60 modules with six **planned** levels per module.

- **Wave 1 (highest immediate value):** Excel & Google Sheets; CV/LinkedIn/Applications; Canva & Social Design; Social Media Management; Customer Service & WhatsApp Business.
- **Wave 2:** Video Editing for Reels; Virtual Assistant & Remote Work; SEO & Google Business Profile; Data Analytics & Dashboards; Presentation & Public Speaking.
- **Wave 3:** Applied AI for Work; WordPress Website Building; E-commerce & Online Selling; Sales & Client Negotiation; Personal Budgeting & Money Management.

New `life-skills` taxonomy for Personal Budgeting is proposed but must be supported in the content schema/projection before publication. Personal-budgeting content must be educational only, avoiding personalized regulated advice.

## AI-first pipeline: trusted drafts, not autonomous publication

```text
Approved subject brief + course manifest
  -> Reviewable 24-level outline and prerequisite map
  -> AI drafts: lesson copy, Pakistan-relevant case study, distinct challenges,
     defensible answer logic, feedback and remediation, capstone worksheet
  -> JSON/content-schema and outcome alignment validation
  -> Similarity, repetition, unsupported-claim, privacy, copyright and accessibility checks
  -> Subject editor -> language/accessibility editor -> authorized publisher
  -> Versioned draft import with --dry-run and audit trail
  -> Staging browser/mobile/entitlement testing
  -> Approved staged release -> explicit production promotion
```

**Prohibited:** unsupervised AI publication, synthetic reviewer names/dates, imaginary citations or credentials, scraping copyrighted courses, claims of guaranteed jobs/earnings, modifying published learner-history records, opening production payments during content testing.

**Reuse:** the existing AI worker, admin `ai.request` / `ai.review` / `ai.publish` capabilities, versioned learning tables and publication records. New generation code must be bounded, idempotent and retry-safe. Only human-approved immutable versions become learner-visible.

### P0 engineering sequence

1. **Content quality audit and correction:** measure text similarity and generic-template usage across the 68 existing levels; author revised, reviewed, genuinely subject-specific interactions. Preserve prior versions and attempts; add baseline/end-course evaluation.
2. **Catalog read model:** expose published approved courses, module counts, playable first level, difficulty, estimated work and truthful lock/coming-soon status. Consolidate `/en`, `/en/skills`, `/en/paths/[slug]` and `/mainLanding`. No draft-only course should appear as immediately playable or included in paid benefits.
3. **AI authoring service:** take approved course briefs; produce *draft-only* structured module/level/challenge/project artifacts, with provenance, model/prompt version, spend, source references and validation feedback. Separate generation and publication credentials.
4. **Dry-run importing and review:** support resume/idempotent import; require SME approval and explicit publisher action, role-based permissions, immutable content-version semantics, duplicate detection, preview and rollback.
5. **Practice and learning journey:** real per-module progression, baseline/end assessments, useful hints, topic-specific remediation, saved progress, completion, capstone template or exercise and clear results. Don't claim automatic assessment of offline artifacts without implementation.
6. **Premium boundary:** use the existing server entitlement/capability model to distinguish free starter lessons from Premium depth. Maintain the 3 free missions/day contract and never hide earned progress. Actual price stays PKR 990 unless formally changed.
7. **Analytics and support:** funnel from course discovery to first useful project, per-level helpfulness/reporting, mastery improvement, completion, cancellation/charge disputes and accessible customer support.
8. **QA and release gates:** published-only catalogue, per-course content completeness, duplicate/quality validation, desktop/mobile and slow-network browser tests, keyboard/assistive technology, payments/entitlements and exact staged release identity.

## Wave acceptance and launch gates

**Gate A — foundation (target weeks 1–2):** a trusted catalogue source, published-only rendering, existing-course repetition audit and AI drafting contract exist; 15-course planning manifest validated by CI. No user-visible expansion claims.

**Gate B — first five additions (target weeks 3–6):** **10 genuinely complete courses** (5 improved + 5 new), 120 reviewed new levels, at least 360 original subject-specific interactions, five completed project templates, functional previews and Premium checks. This is the recommended **minimum readiness gate** for marketing the expanded PKR 990 offer, provided payment/OTP and overall UAT also pass.

**Gate C — next five (target weeks 7–10):** 15 total complete courses, 240 added levels, 10 capstones, rechecked analytics, performance, accessible discovery.

**Gate D — final five (target weeks 11–14):** 20 total complete courses, 360 added levels, 15 capstones, freshness/review ownership and full certification. Weeks are conditional delivery goals requiring sufficient reviewer and engineering capacity, not commitments.

No automatic launch on a calendar date. Gates depend on content approval, learner test evidence and verified functionality.

## Quality requirements for each course

- 4 distinct modules, 6 meaningful sequential levels each, clear learner prerequisites and intended difficulty. Module 1 should be accessible to beginners; subsequent levels must build.
- At least 3 **non-recycled** challenges per level selected pedagogically from the existing supported formats. A copy/paste “confirm requirement, check evidence, act” pattern across subjects fails review.
- Every challenge includes correct evaluation payload, plausible distractors, a subject-specific explanation, helpful correction/remediation and legitimate source provenance where needed.
- Baseline and end assessment measure aligned outcomes with a comparable rubric. One original practical deliverable (capstone), with directions and success checklist.
- No unlicensed source material, false job/earnings guarantees, purchased certificates or unfounded platform claims. Tool-specific lessons carry next review date (commonly 90 days); evergreen lessons get proportionate scheduled review.
- Mobile, low-bandwidth, screen reader and keyboard-friendly alternative interactions; reasonable duration; clear language suitable for a Pakistan-first audience.
- Reviewer and publisher IDs are real authorized accounts; no auto-approval, no backdating, no direct editing of published versions or completed learner attempts.

**AI generation economics:** budget by *approved level*, not generated requests. Instrument model spend, retries, rejection rates, time per approved level, and subject-review backlog. Limit retries and fail closed on provider errors. Do not send learner CVs, messages or private financial data to generation without explicit informed consent and a reviewed privacy contract.

## Deliverable owners and developer handoff

| Responsible | Work that can be completed AI-first | Human/external gate |
| --- | --- | --- |
| Product/learning owner | Course briefs, targets, scope prioritization and outcome drafts | Approve priorities, availability and all consumer-facing claims |
| AI/content engineer | Draft generator, schema validation, uniqueness checks, import/export CLI, instrumentation, automated tests | Provider credentials and controlled secrets supplied by authorized owner |
| Backend engineer | Published catalogue API, versioned draft staging, approval separation, project/assessment state and entitlement integration | Production migrations and service configuration approval |
| Frontend engineer | Homepage/course cards, filters, previews, modules, resume and project resources | UX/content review and mobile accessibility sign-off |
| Subject SMEs + language editor | Review AI draft questions, sources, answer keys, difficulty, Pakistan relevance and accessibility | Written editorial approval on every publishable version |
| QA/DevOps | Repeatable DB fixture, E2E staging, security, load and deployment evidence | Human promotion authorization, payment-provider/OTP tests where required |

Recommended team for the schedule: 1 product/content lead, 1 AI/content engineer, 1 backend/full-stack engineer, 1 frontend engineer, 2 part-time subject reviewers rotating by course, 1 QA/editor. Defer the deadline if review capacity is not available.

## Anti-complaint and commercial safeguards

- Display a **live count of published, playable courses**, never planned titles as currently subscribed content.
- Course cards must accurately show number of playable levels, estimated time, difficulty, requirements and free/Premium status. “Coming soon” is clearly separate from “Available now.”
- Provide a working preview for free users, clear subscription renewal/cancel/unlink and refund support, with no fabricated time pressure or earning promises.
- Define the first subscriber experience: choose goal -> baseline -> three useful practice tasks -> visible progress -> first completed small artifact in the first week.
- Measure first-week practical completion, repeated-content reports, billing-related complaints, support response times, day-7 and day-30 learning return, cancellations and refund requests.
- Launch price, plans and payment flows remain unchanged here. Introductory offers (e.g. PKR 799) require separate commercial and payment approval; not part of engineering scope.

## Definition of done and production boundary

A course is **not live** until its content owner marks it reviewed, publisher signs off, the draft importer has recorded immutable version/source evidence, server returns it in the published-only projection, all levels are playable with approved feedback, its capstone is usable, and per-course E2E has passed.

A batch is **not certified** if only the workflow wrapper passes while actual browser jobs skip/fail. Require exact staging SHA and green execution. Production promotion is **always a separate, explicitly authorized human action**. No production changes, auto-charges, or content publication are authorized by this planning PR.

## Next developer handoff order

Start with catalog source of truth + quality audit and one complete Excel pilot, then build the draft-only AI generator and approvals around that pilot, not 360 levels of generic auto-generated quizzes. Reuse and improve the existing seven challenge types. When the Excel pilot shows high learner value and review throughput, open the other Wave 1 course packages in parallel.

Each task must link back to the new expansion tracking issue and include changed paths, acceptance tests, staged evidence and dependencies.
