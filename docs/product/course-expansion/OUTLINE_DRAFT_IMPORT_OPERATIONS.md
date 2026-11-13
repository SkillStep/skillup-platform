# AIFS 14-course outline importer — staging operations

**Status:** Engineering draft. This importer supports the AI-first content workflow but does **not** author approved lessons, generate final quizzes, enroll learners, change payments or publish courses.

## Scope

The 15-course manifest includes one Excel course with its own 24-level/72-question draft importer. This second importer supports the **remaining 14 courses** only.

| Artifacts | Planned draft records | Publishing status |
| --- | ---: | --- |
| Courses | 14 | Not reviewed, not published |
| Modules | 56 | Draft, noindex |
| Level briefs | 336 | Draft, noindex; no generated challenge answers |
| Challenges | 0 | **Not authored**; never claim these 336 positions are playable |
| Proposed `life-skills` category | 1 | Draft category version, unreviewed |
| Existing 5 live courses | Unchanged | No mutation |
| Excel draft | Unchanged | Handled by separate importer |

Every draft source points to `docs/product/course-expansion/outlines/<course-slug>.json`, containing 24 individually named level positions per course. The manifest and outlines must pass the existing curriculum brief validator before an editor can use them.

## Non-writing verification

From the repository root:

```bash
pnpm --filter @skillup/database aifs:outline:dry-run
pnpm catalog:briefs:check
```

The first command parses, validates, hashes and reports the outline count **without opening any database connection**. No application state changes.

## Applying only to an authorized non-production database

The database must already contain the reviewed launch categories and migrations. Authorized operators can run:

```bash
APP_ENV=staging AIFS_ALLOW_DRAFT_IMPORT=yes \
  pnpm --filter @skillup/database aifs:outline:import-draft
```

`DATABASE_URL` must identify the approved staging PostgreSQL instance. The importer does not derive or verify environment identity from the DB hostname: operators must independently confirm the target connection first. The CLI rejects production/unknown `APP_ENV` and requires the second `AIFS_ALLOW_DRAFT_IMPORT=yes` acknowledgment.

Runs in a single database transaction, takes an advisory transaction lock, refuses already published/reviewed courses, and rejects conflicting existing draft level titles. A second import of identical draft titles makes **no changes**. Any validation/SQL failure rolls the transaction back.

The proposed `life-skills` taxonomy receives an unreviewed **draft** version in staging. It must not appear as an approved public category or bypass its own review.

## CI evidence and safety gates

`pnpm --filter @skillup/database db:smoke` uses a fully rolled-back PostgreSQL import to validate:

- all 14 draft courses, 56 modules and 336 level positions;
- a second idempotent import;
- zero published level versions, zero reviews, zero newly authored challenges and no public publication records;
- no unexpected change to the five currently published courses;
- a draft-only proposed life-skills category;
- no new course rows remaining after rollback.

All results require the exact GitHub Actions workflow SHA and green real test execution, not a wrapper-only success.

## Next content engineering tasks

1. For the remaining 14 courses, generate **original** subject-specific lesson explanation, distinct exercises, feedback, misconceptions and private evaluator keys from the scoped 360-level prompt plan. These are not yet in this importer.
2. Subject reviewers and language/accessibility reviewers verify every answer and scenario. No AI self-approval, fabricated timestamp or copyright assumptions.
3. Implement a versioned content importer that attaches validated, editor-approved challenge versions to the existing draft level records **without overwriting or losing learner attempts**.
4. Add real baseline/end assessments, downloadable practical projects, progress UI, Premium entitlement QA and authorized publisher workflow.
5. Confirm actual staging certification and business approval before any production release. The importer must never directly set statuses to `published`.

**If the CLI reports that a draft already differs from the manifest, do not change the source or database to force it through.** Reconcile it through a deliberate editorial version transition with an audit trail.
