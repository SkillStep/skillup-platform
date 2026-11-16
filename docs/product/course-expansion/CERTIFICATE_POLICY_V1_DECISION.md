# SkillUp — completion certificate policy v1 (owner decision draft)

**Status:** Decision-ready *proposal*, not an approved product policy or a production configuration.  
**Scope:** Initial ten skills (five existing published plus five planned). The exact canonical slugs/titles, machine-readable parameters and review status are in [`certificate-policy-v1.proposal.json`](certificate-policy-v1.proposal.json).  
**Tracking:** [#265](https://github.com/SkillStep/skillup-platform/issues/265), parent [#261](https://github.com/SkillStep/skillup-platform/issues/261); [#271](https://github.com/SkillStep/skillup-platform/issues/271) is the release QA gate.  
**Owner:** Product owner must record a genuine accountable decision; legal/privacy reviewer must record a separate review. No invented approval identities or timestamps.

## Short, implementable decision

| Rule | Recommended v1 setting | Learner explanation |
| --- | --- | --- |
| Minimum score | **80% in a completed session for every required level** | Reach at least 80% on each required lesson/level |
| Learning coverage | **100% of the skill's versioned required published levels** | Complete every mandatory level; do not skip one |
| Question coverage | **All required published challenges have a correct server-evaluated attempt** | Correct every mandatory practice question at least once |
| Tries per question | **2 attempts inside each level session** | You have a second chance in that session |
| Repeat a level | **Unlimited new level sessions**; no daily cooldown in the existing gameplay service | Retry a level until mastered, without deleting prior attempts |
| Practical capstone | **Required; an actual independent, authorized human must record “passed” evidence** | Submit the practical project and receive reviewer approval |
| Baseline/final assessment | **Formative only in v1; not an eligibility gate** | Practice before and after a course, but no credential based on an unintegrated test |
| Certificate | **One per learner/skill/approved requirement version; no additional fee** | No separate certificate purchase; earned on verified completion |
| Access | Content paywalls remain; the award remains available after subscription expiry | Premium is needed to play Premium content, but an earned credential is retained |
| Public verification | **Off** | Certificates are visible/downloadable only within the learner's authenticated account |
| Historical backfill | **Off** until expressly approved real-evidence audit | A displayed progress percentage alone never gives an old certificate |
| Legal description | **Educational completion only; not accredited** | No degree/licence, government endorsement or employment guarantee |

### Why both 80% and 100%?

They check **different evidence**, not two competing passing scores. The 80% threshold applies to each level's real completed gameplay session (`awarded_points / max_points`). Separately, *every* required challenge must have a `correct` server-evaluated attempt, possibly across earlier and later level sessions. `incorrect`, `needs_review`, skipped, client-displayed completion, nonmatching version and unapproved draft content never count. No averaging a strong level against a failed one. The current engine implements both checks.

**Retries:** The existing gameplay service creates two attempts per challenge per session and starts a fresh session after a prior one completes or expires. The proposal therefore matches existing behavior rather than promising unimplemented daily retry controls. Attempts and completed session evidence remain auditable; retries cannot cause an unauthorized certificate.

**Baseline/final tests:** The five newer drafts contain 40 extra paired assessment candidates, but these are not yet graded or versioned as an exam in the existing certificate engine, and the original five courses have no matching approved exam contract. To avoid creating false pass/fail claims, v1 does *not* count the 40 draft questions. A mandatory endline exam would require new published content, versioned evidence schema, an approved threshold/retake policy and a new requirement-set version. Do not silently turn draft tests into credentials.

## Exact learner/certificate wording

- Certificate heading: **Certificate of Completion — [full approved course name]**, derived from the frozen published skill-version title, not an edited user-supplied field.
- Required footer, **exactly as already rendered**: **“SkillUp educational completion certificate — not an accredited professional qualification.”**
- Optional learner-facing message: “This certificate records completion of SkillUp learning activities. It is not an accredited professional qualification or a licence.”
- Include the learner's **profile display name**, completion date, issuance date and opaque certificate ID. The app currently checks the name's length; **it does not independently verify government identity**. Do not call the identity government-verified.
- Never claim affiliation with government, HEC, a university, professional bodies, regulatory authorities or an employer unless independently authorized. No jobs, promotions or salaries are guaranteed.
- PDF is currently English/WinAnsi-limited; unsupported Unicode names must fail privately rather than be silently changed. A proper Unicode font renderer is a separate required QA item before wider-language launch.

**Legal status:** The disclaimer wording is the proposed, existing product text, **not** a conclusion that an independent lawyer has approved it. Product and legal/privacy approval should be recorded in #265 before activating a requirement set or any public marketing.

## Requirement and progress semantics

| Term | Exact meaning for certificate eligibility |
| --- | --- |
| Required | Identified by an **approved, immutable, versioned** requirement set for one actually published skill version; all its required published levels and every published challenge belonging to those levels are included |
| Passed level | A server-recorded `level_play_sessions` row with `state=completed`, non-null `completed_at`, nonzero `max_points`, exact required version ID and at least **80%** points |
| Passed challenge | `challenge_attempts.status=correct`, recorded for the same learner and exact required challenge-version ID |
| Skipped | Incomplete/opened-only level, missing correct attempt or omitted required challenge; **never** credited |
| Needs review | Non-passing, unless a separate authorized review process later creates a true passing event; not automatic |
| Published | Independently approved live course-version state; a `draft`, `in_review`, `superseded`, `archived`, `withdrawn` or `rejected` item cannot newly establish eligibility |
| Capstone passed | Most recent real `skill_capstone_attestations` decision for this requirement set is `passed`, with evidence digest and **authorized independent reviewer** |
| Earned | Valid, unique, unrevoked server-issued award for the frozen requirement-set version; status is not recalculated from the learner's currently purchased plan |
| Revoked | Previously issued award with authorized reason, actor and immutable event history; no automatic reissue |
| Re-certification | A later *separately approved* requirement-set version, with fresh evidence where required; never auto-issue or overwrite an old award |

**Implementation note:** The existing capstone table enforces reviewer ≠ learner; code review must additionally verify **reviewer authorization and authentic evidence provenance** before a passed attestation can unblock issuance. This is a **P0 release security gap**, not an authorization for a random account to approve another person's work.

## How to verify implementation against the existing repository

- `apps/api/src/certificates.ts` verifies exactly published requirement versions, all challenge IDs, 80%-capable per-level score and `status=correct` server attempts; capstone requirement and one-award semantics are in its `eligibility` and `issue` paths.
- `apps/api/src/gameplay.ts` creates the **two-attempt** per-challenge session limit; new sessions after completion/expiry support retakes.
- `packages/database/src/certificates-schema.ts` has versioned required level/challenge IDs, score threshold, retries flag, distinct capstone reviewer, unique award per learner/skill/requirements version and audited award events.
- `apps/api/src/certificate-pdf.ts` contains the **exact** A4 footer. `tools/aifs-certificate-smoke.mjs` verifies issued certificate owner isolation, concurrency-safe identity and default-disabled issuance in rolled-back CI.
- All v1 parameters are authored as **proposal-only**. They are not a SQL migration, approved requirement row or runtime configuration. `SKILLUP_CERTIFICATE_ISSUANCE_ENABLED=yes` (as read by `apps/api/src/index.ts`) must remain disabled.

## Owner / legal acceptance and activation steps

1. **Product owner:** Confirm the 80% per-level threshold, 100% challenge correctness, two tries per question/session, unlimited level replays, reviewed capstone, non-graded baseline/final tests, no separate fee and no public verification. Record named, authenticated approval of this specific policy version and digest in #265.
2. **Legal/privacy:** Confirm the disclaimer and marketing claims, learner display-name limitation, account-privacy design, retention and revocation. Record actual signer/decision.
3. **Backend/security:** Close the capstone-attestation reviewer authorization gap and forbid activation without genuine owner evidence. Do not set mock role/approval IDs.
4. **Content team:** Review the five additional course drafts, protected final answer keys and capstones (PR #280 / #281); each release still requires separate genuine editor, two reviewers and publisher.
5. **QA:** Exact-SHA tests for 79% failure / 80% acceptance, missing one correct challenge, capstone fail/approve, retries, Free/Premium/expired, concurrent duplicates, revoked awards, name rendering and cross-account PDF denial.
6. **Release owner:** Activate the proper requirement set/flag only after all approvals, independent staging certification and an explicit production go/no-go. **No publication, activation, award issuance or production change is authorized by this PR alone.**

**Product-owner acceptance record:** PENDING — do not fill in another person's name/signature or timestamp.  
**Legal/privacy acceptance record:** PENDING — requires genuine review.  
**Feature state:** OFF.  
