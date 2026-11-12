# Excel AIFS draft importer — operator notes

**Current state:** Development PR #249, review required. This is a **draft-only** importer for a 24-level Excel course. It does not publish content or grant access, and must never be used as a shortcut around content review.

## What is implemented

- Source files: `drafts/excel/module-01.json` through `module-04.json` (24 original levels, 72 interactions), plus fictional order/expense CSVs and a capstone rubric.
- Pure dry-run validation requires **no database**. It checks content integrity, question-key correctness, course scope and that no module falsely claims approval.
- A transaction-scoped importer inserts a **draft** skill, path, four modules, 24 lessons/levels and 72 question/evaluation records using stable IDs and the existing database tables.
- Existing launch skills, challenge versions, learner progress and billing are never mutated. Every imported content version remains `draft`, `noindex` and has null reviewed/published timestamps.
- An existing identical draft is a no-op. An existing published or differing course **aborts**, rather than mutating it in place.
- Smoke tests create the draft **inside a rolled-back PostgreSQL transaction**, verify 24 draft levels, 72 private answer evaluators, 0 published versions, repeat safety and rollback.

## Commands

From the repository root:

```bash
pnpm --filter @skillup/database aifs:dry-run
pnpm catalog:drafts:check
```

The dry-run prints a SHA-256 checksum of the four JSON draft files. Record that checksum in the review ticket before discussing a staging import.

Only after running quality CI and confirming a **non-production** database target, a developer/operator with authorization can execute:

```bash
APP_ENV=staging AIFS_ALLOW_DRAFT_IMPORT=yes \
  pnpm --filter @skillup/database aifs:import-draft
```

The command additionally requires a valid `DATABASE_URL`. It explicitly rejects `APP_ENV=production`, missing environment identity and calls without the second write acknowledgment. **No production execution is authorized.**

If the existing `digital-skills` category is not seeded, the import aborts with no writes.

## Important limitations

The CLI is not a content-approval system. A database draft import is only an editorial staging step. The production app continues showing only genuinely published, playable courses from the published-only catalogue API. The Excel course must not be advertised in Premium until its content versions are reviewed and published through a separately authorized, auditable publication workflow.

The following still require implementation or approval before any subscriber release:

- Subject editor: verify spreadsheet facts, formulas, answer keys and product-specific differences in Excel and Sheets.
- Accessibility/language editor: validate keyboard, mobile and alternative formats; correct unclear exercises.
- Publisher: separately approve an immutable version with a real account and audit event (the draft importer cannot do this).
- Backend/frontend: present 24 sequential levels, assessment checkpoints, feedback and downloadable/local capstone assets through the learner app.
- QA: verify free/Premium access, persistence, all 72 evaluation keys, safe retry, exact-SHA staging release, signed payment and refunds.
- Product owner: approve accurate public course count, price/value claims and production promotion.

**Do not manually change status columns to `published`.** The course hierarchy has versioning, approval, source and audit requirements. Publication must use the authorized workflow when it is built.
