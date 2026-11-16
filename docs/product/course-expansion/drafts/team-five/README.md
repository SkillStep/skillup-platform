# Team-five complete draft courses — development and editorial handover

**Scope:** [#261](https://github.com/SkillStep/skillup-platform/issues/261), [PR #280](https://github.com/SkillStep/skillup-platform/pull/280). All material is **AI-assisted draft content, not human-approved and not published**.

| Public learner title | Canonical existing/new course identity | Level count | Deterministic draft questions | Practical project |
| --- | --- | ---: | ---: | --- |
| Prompt Engineering & Generative AI | `prompt-engineering-generative-ai` (new) | 24 | 72 | Five-prompt tested toolkit |
| Cybersecurity & Digital Safety | `cybersecurity-digital-safety` (new) | 24 | 72 | Defensive risk/incident playbooks |
| Data Analytics & Decision Making | `data-analytics-dashboards` (reused) | 24 | 72 | Reproducible operational dashboard |
| AI Automation & No-Code Tools | `applied-ai-workflows` (reused) | 24 | 72 | Human-reviewed no-code process |
| Sales, Negotiation & Client Management | `sales-client-negotiation` (reused) | 24 | 72 | Discovery and client offer pack |
| **Total** | **5 unique additional courses** | **120** | **360** | **5** |

Each course has four modules with six numbered levels each. Each level contains an original teaching note, worked example, objective, common mistake, remediation, hint, and three evaluated practice formats (multiple-choice, scenario and true/false) with answer-specific feedback. Answer keys and original source material are **not** externally fact-checked, and a green schema check does **not** mean teaching correctness or release readiness.

## Developer verification (no external credentials required)

```bash
pnpm catalog:team-five:check
pnpm --filter @skillup/database aifs:team-five:dry-run
```

The normal `pnpm test` includes the five-course validator and the normal real-PostgreSQL `pnpm db:smoke` includes a **rolled-back** import-and-replay test. The smoke intentionally seeds the other 14 outline drafts in a test transaction, proves that the three reused course IDs are retained, imports the two new drafts, checks 120 level rows/360 challenge evaluations, repeats the import idempotently, proves no new publications and rolls everything back. CI must be green on an exact commit SHA before merge; a successful wrapper with skipped tests does not qualify.

## Draft-only staging import (not run as part of authoring)

Confirm the **actual DATABASE_URL refers to approved non-production staging**, because the environment flag alone cannot prove database identity. With explicit operator authorization:

```bash
APP_ENV=staging AIFS_ALLOW_DRAFT_IMPORT=yes \
  pnpm --filter @skillup/database aifs:team-five:import-draft
```

The command is transactional and refuses production, unexpected state, reviewed or published content, conflicted prior drafts or altered questions. A replay with identical draft content is idempotent. No course is marked approved/published, public catalogue routes still expose only the original five published courses, no reviewer timestamps are created, and no certificates are issued.

## Mandatory release-blocking issues

1. **P0 — Public answer keys:** The canonical GitHub repository is **public**. These generated question/answer pairs and their commit history are visible, even if the files later change or are deleted. They are **not secure high-stakes assessment items and must never be released as currently written**. Re-author/re-key and independently review the final private evaluator materials in an access-controlled editorial system/repository; ensure public bundles contain no key; verify the final version's integrity before use.
2. **P0 — Human subject/factual/rights review:** A subject expert checks all 360 keys, plausible distractors, case-transfer wording, sources, truth values and explanations; an independent language/accessibility reviewer checks readability and inclusive presentation. Record real editor, two reviewer and distinct publisher decisions using the existing #229 authorization workflow. No invented approvals.
3. **P0 — Actual gameplay and premium QA:** Validate all published versions in staging: first/middle/final levels, incomplete attempts, scoring, order/prerequisites, signed-in Free/Premium/expired gating, resume, mobile and screen-reader usability. The draft import is necessary but does **not** prove publishable playability.
4. **P0 — Product scoring and completion policy:** Apply owner-approved rules for score/retakes/capstone evidence and certificate issuance under #265. The project rubrics are educational **self-review guides**, not automatically graded level completion.
5. **P0 — Exact-SHA release gate:** Successful GitHub Quality CI and repeatable PostgreSQL smoke, genuinely executed exact-SHA staging certification, real publisher decisions and separate authorized production promotion. No JazzCash, price or production changes here.

## Suggested editorial review order

First audit **Cybersecurity** for safety, then **Data Analytics** for correct figures/charts, **AI Automation** for side-effect and permission boundaries, **Prompt Engineering** for source-verification and hallucination handling, and **Sales** for fair commercial representations. Corrections must be new reviewable drafts with provenance; old identifiers and learner history must be preserved.

**Status on authoring:** Five complete **draft** course packs and capstones are in PR #280. Final public playability, security, grading and publishing are not approved or certified by this README.
