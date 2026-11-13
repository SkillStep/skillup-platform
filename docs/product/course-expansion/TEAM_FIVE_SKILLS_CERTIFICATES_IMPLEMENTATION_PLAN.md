# SkillUp: team-requested five skills + certificate implementation plan

**Plan date:** 13 Nov 2026  
**Source:** Team implementation brief, *SkillUp 5 more skills and certificate.docx* (§§1–12). The brief is an external product handoff, not a merged programme or a course approval.  
**Status:** Planning-only — **no new skill or certificate is live or authorized for production by this document**.  
**GitHub execution epic:** [#261](https://github.com/SkillStep/skillup-platform/issues/261)  
**Machine-readable addendum:** `team-five-skills-certificate-plan-v1.json`; keep the original `catalog-plan-v1.json` intact until the new two-course revision is formally reconciled with its validators.

## 1. Baseline and reconciliation

As reviewed on 13 November, both production and staging Skills pages list **five published playable** courses. The earlier [#225](https://github.com/SkillStep/skillup-platform/issues/225) roadmap contains **15 proposed additions** and targets 20 unique courses; it is not a set of 15 published courses.

The team proposes five additional names. **Two are genuinely missing** and require new draft course IDs and slugs. **Three overlap** with existing course outlines and should extend those same draft identities rather than add duplicates.

| Team-facing title / desired card | Implementation identity | Issue | Treatment |
| --- | --- | --- | --- |
| Prompt Engineering & Generative AI | `prompt-engineering-generative-ai` | [#263](https://github.com/SkillStep/skillup-platform/issues/263) | **New**, separate from general AI Tools and AI automation |
| Cybersecurity & Digital Safety | `cybersecurity-digital-safety` | [#264](https://github.com/SkillStep/skillup-platform/issues/264) | **New**, beginner-friendly safety |
| Data Analytics & Decision Making | `data-analytics-dashboards` | [#242](https://github.com/SkillStep/skillup-platform/issues/242) | **Reuse and expand** Data Analytics & Dashboards |
| AI Automation & No-Code Tools | `applied-ai-workflows` | [#244](https://github.com/SkillStep/skillup-platform/issues/244) | **Reuse and expand** Applied AI for Work |
| Sales, Negotiation & Client Management | `sales-client-negotiation` | [#247](https://github.com/SkillStep/skillup-platform/issues/247) | **Reuse and expand** Sales & Client Negotiation |

Team-suggested alternate slugs for the three reused courses are `data-analytics-decision-making`, `ai-automation-no-code-tools` and `sales-negotiation-client-management`. These are **not currently live routes**. Prefer retaining immutable existing draft IDs and canonical slugs until the product owner approves optional aliases / redirects. Do not silently fork the importer records or clear learner progress.

**Arithmetic:** 5 published + 15 existing planned + 2 genuinely new = **22 unique courses** in the revised long-term roadmap. The first **10-card** milestone is 5 currently published and 5 marked **Coming soon**; ten cards do **not** mean ten playable courses. The existing first five must remain unchanged.

## 2. Card copy and preview states

Use the exact five short descriptions from the source brief, stored in the addendum JSON. Implement [#262](https://github.com/SkillStep/skillup-platform/issues/262) as a **separate curated preview-only projection** alongside the current published-only catalogue. Do not change `/v1/catalog/courses` to return unapproved draft content.

- **Coming soon:** search-visible and accessible title/summary, optionally a reviewed public outline, but **no** active `Start practice` button and no direct unpublished `/learn/` content link. Its modules, assessments and evaluator keys stay private.
- **Published:** can transition only after actual human editor, distinct subject reviewer, distinct language/accessibility reviewer and distinct publisher evidence under completed [#229](https://github.com/SkillStep/skillup-platform/issues/229), plus content-specific QA. Published content then comes from the authoritative catalogue and replaces the preview card without duplicating it.
- **Premium:** Free users can see truthful previews; paid access and expired subscriptions are enforced on **server gameplay routes**, not only card UI. Do not hardcode the free Level 1 count until the product owner approves it.
- Existing site styling, Search, mobile layout, actions and home/Premium claims must use truthful **5 available / 5 coming soon** counts until review gates pass.

## 3. Minimum course authoring contract

Five course work packages: [#263](https://github.com/SkillStep/skillup-platform/issues/263), [#264](https://github.com/SkillStep/skillup-platform/issues/264), [#242](https://github.com/SkillStep/skillup-platform/issues/242), [#244](https://github.com/SkillStep/skillup-platform/issues/244), [#247](https://github.com/SkillStep/skillup-platform/issues/247). The team brief suggests five topic stages, which have been reconciled into the platform's **four modules per course, six levels per module**. Each requires **24 complete levels, ≥72 genuinely subject-specific evaluated exercises and a practical capstone**, for **120 levels, ≥360 exercises and five capstones** across the five courses. The existing three reused outlines contribute draft structure but not verified, playable exercises; never count those briefs as finished content.

For each level: a measurable objective, original accessible teaching text, worked example, feedback, hints, correction rationale, varied evaluated exercises with private keys, appropriate source/rights provenance and a reviewable assessment. Each course: baseline/end comparison, capstone with original synthetic sample data/artifacts, self-review rubric and a mobile-friendly, low-bandwidth experience. Use existing authoring [#228](https://github.com/SkillStep/skillup-platform/issues/228) and learning [#230](https://github.com/SkillStep/skillup-platform/issues/230), not direct SQL publication.

**Noteworthy boundaries:** Cybersecurity uses fictional phishing/incident scenarios and defensive practices only. Prompt Engineering emphasizes prompt refinement and source checking; AI Automation emphasizes triggers/actions, no-code integrations, approvals and retries, not duplicate prompt lessons. Data Analytics covers everyday decision trade-offs, not only chart creation. Sales adds relationship and retention, rather than repeating the existing Freelancing course.

## 4. Certificate platform: one engine for all ten skills

**Policy approval [#265](https://github.com/SkillStep/skillup-platform/issues/265)** must explicitly decide the passing threshold, retake rule, mandatory challenge definition, each course's versioned completion criteria, included Premium plan, certificate wording, legal/privacy permissions, historical backfill and public verification policy. A numeric threshold mentioned in a draft issue is only a proposal.

**DB and eligibility [#266](https://github.com/SkillStep/skillup-platform/issues/266):**
- Store approved immutable `skill_completion_requirement_set` versions tied to published `skill_version_id` and required `level_version_id`/assessment/capstone evidence.
- Check **100% of required published challenges/levels have genuine server-evaluated pass records**, not a client-supplied percentage, skipped content, drafts or locked challenges.
- Store certificate award with UUID internal ID, permanent unguessable public ID, learner, skill, approved requirement version, frozen skill title/verified display name, real completion timestamp, issuance timestamp, PDF metadata, status and append-only audit. Uniqueness must enforce product-approved one-per-learner/skill/requirement-version.
- No migration backfill or automatic award. Previously earned awards remain accessible after subscription expiry unless legitimately revoked.

**Issuance [#267](https://github.com/SkillStep/skillup-platform/issues/267):** transaction-safe idempotent one-time issue on verified completion. Replays, concurrent completions and retries return the same valid certificate, never another award. Other skills remain independently locked. Revocation demands an authorized role/reason/audit, never rewrite past award facts. Feature OFF by default.

**PDF and optional verification [#268](https://github.com/SkillStep/skillup-platform/issues/268):** one SkillUp purple branded **A4 landscape** template, exact skill name/title from the team document, verified learner name, completion date, opaque ID and a clear statement of completion. Footer exactly: **"SkillUp educational completion certificate — not an accredited professional qualification."** Ownership-protected PDF preview/re-download, sanitize names/markup, and test long text. Public read-only verification and QR remain **off unless approved**; if enabled, do not expose email, account ID, score or attempt history.

**Learner UI [#269](https://github.com/SkillStep/skillup-platform/issues/269):** honest locked/eligible/earned state on path pages; congratulations only after server issuance; authenticated **My Certificates** in profile; view and PDF download after Premium expiry. Mobile, keyboard and screen reader support.

**Historical backfill [#270](https://github.com/SkillStep/skillup-platform/issues/270):** read-only dry-run first against historical server-recorded evidence for the original five. No awards from UI 100% alone; explicit product-approved and auditable apply stage.

## 5. Execution order, roles and dependencies

| Workstream | Tracking | Unblock condition | Suggested owner |
| --- | --- | --- | --- |
| Reconcile existing roadmap + policy decisions | #261, #265 | Product owner accepts titles/identity, grading, free access, legal/verification | Product + Content lead |
| Five safe public previews (not playable) | #262, #227 | No draft gameplay leakage; canonical-slug decision | Frontend + API |
| Author missing + rework three courses | #263, #264, #242, #244, #247 | Draft authoring, human specialists, real rights/answer quality | Content lead + SMEs + AI engineer |
| Store versioned certificate evidence | #266 | Certificate policy approved | Backend + database |
| Implement idempotent award engine | #267 | #266 schema and server pass evidence | Backend + security |
| Branded PDF and learner UI | #268, #269 | #267 private certificate API; approved branding | API + frontend |
| Verified historical dry-run | #270 | #265/#266/#267 completed | Data + privacy |
| Exact-SHA certification and launch | #271, #233 | Each actual course reviewed under #229, entitlement QA, certificate checks | QA + DevOps + Publisher |

No date estimates are commitments; content SME review and product-policy choices are the actual critical path. Existing work should remain under issues #226/#228/#230/#231/#233 to avoid parallel conflicting implementations.

## 6. Definition of done and release guardrails

1. First milestone: **five existing published skills plus five accurate Coming-soon cards**, no duplicate draft identity, clear search/navigation/disabled practice, honest Premium messaging.
2. Each new published course: 24 **actually playable**, independently reviewed levels, 72+ corrected exercises, capstone, outcome assessment, full Free/Premium/expired entitlement QA and separate publisher action.
3. Shared certificates for all ten: incomplete Free and incomplete Premium **no award**; genuine completion yields **exactly one** skill-specific certificate; duplicate events never create duplicates; other skills still locked; after-expiry re-download available; no extra fee; optional public verification does not leak private data.
4. Reuse existing certificate issuance records/progress after course version updates; immutable audit and rollback paths. Backfill only with real evidence and owner authorization.
5. Mandatory [#271](https://github.com/SkillStep/skillup-platform/issues/271) exact-SHA staging tests across ten skills, negative authorization, mobile/keyboard accessibility, PDF rendering, revoked/expired states and production regression checks. Do not accept wrapper-only green reports that skip execution.
6. **No production deployment, no automatic human approval, no auto-publication, no payment/JazzCash change, no invented certificate awards, no accreditation claim** from this plan or its PR. Production and marketing claims need independent authorization.

**Implementation begins with:** approve #265 policy and #262 preview; authors then work in parallel on five course packages while backend builds #266–#269. This plan does not imply any course has passed real human review.
