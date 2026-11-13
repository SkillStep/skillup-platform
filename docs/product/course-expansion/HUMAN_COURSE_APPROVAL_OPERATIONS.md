# AIFS human approval and course publication — operator guide

**Scope:** Controlled and auditable human decisions for private imported course drafts. Not a content-authoring shortcut, not proof of academic accuracy, and not authorization to publish any existing AIFS content.

## Principles

- Four different **real logged-in accounts** are required: submitting \`content_editor\`, \`content_reviewer\` for subject and rights, another \`content_reviewer\` for language/accessibility, and an independent \`publisher\`.
- Each submission captures a SHA-256 fingerprint of its complete draft version hierarchy (including private answers, options, source records and objectives) and frozen version IDs. Changed material invalidates pending review.
- Only four-module, 24-level drafts with at least three evaluated exercises per level and original source/objective references pass preflight. The 14 outline-only courses are deliberately blocked until full exercise content is authored.
- The two reviewers attest mandatory checklists with reasons and genuine authenticated user IDs. No AI self-approval, synthetic account reviews, implicit sign-off from a passing CI check, or single-person approval.
- A publisher needs a separate account, four-person separation, meaningful reason, course-specific HTTPS staging QA evidence and the exact frozen version. Release remains **off** by default, including in production.
- Publishing switches complete existing version records and the canonical public catalogue visibility atomically. Prior version IDs and learner attempt references are preserved; no destructive deletion.
- Every decision is recorded in append-only PostgreSQL review/event tables. Rejected requests return errors; in-progress approvals can be reviewed privately from the admin console.
- \`rollback\` restores the most recently superseded and separately approved complete hierarchy; \`withdraw\` hides the current first-time release when no preceding approved version exists.

## Migrations and dry-run

Migrations: \`0034_course_editorial_approval.sql\` with append-only evidence and immutable submission records.

Existing dry-run importers are still the sole authorized input path:

\`\`\`bash
pnpm --filter @skillup/database aifs:dry-run
pnpm --filter @skillup/database aifs:outline:dry-run
pnpm catalog:readiness:check
\`\`\`

After the environment is approved, use the existing **non-production only** \`AIFS_ALLOW_DRAFT_IMPORT=yes\` command from the import runbooks. Never run the draft importer on production or mark draft versions published manually.

## Human workflow

1. Open the private \`/en/admin/course-editorial\` console, enter a course slug, inspect the history. Export the private reviewer packet from \`/en/admin/course-drafts\`. Answer keys must never enter public exports.
2. An editor checks content against the worksheet and submits the draft with a genuine reason. The backend fingerprints **all** currently loaded draft versions.
3. A different subject reviewer checks correctness, original source rights, answer keys and assessment alignment; submits an approval or requests changes with a concrete rationale.
4. Another reviewer checks language, keyboard/mobile accessibility and the practical capstone. Both reviewers must be different people from the submitting editor and each other.
5. A fourth authorized publisher verifies actual course-specific staging QA for that **exact** content version, provides an HTTPS evidence URL, and explicitly confirms the action.
6. Only an authorized operator, after separate launch permission, may configure \`AIFS_COURSE_PUBLISH_ENABLED=yes\` on the intended environment. The feature flag being set **does not** waive reviews or permit production deployment. Keep it absent/disabled during initial staging certification.
7. After publisher release, inspect the signed history, public catalogue, levels, evaluation checks, entitlement behavior and learner progress. Use publisher-only withdrawal or rollback for a bad release, preserving attempts and old versions.

## Routes and roles

| Operation | Method | Route | Role |
| --- | --- | --- | --- |
| History | GET | \`/api/v1/admin/course-drafts/:slug/editorial\` | editor, reviewer, publisher |
| Submit | POST | \`/api/v1/admin/course-drafts/:slug/submit\` | editor |
| Subject/accessibility review | POST | \`/api/v1/admin/course-submissions/:id/review\` | reviewer |
| Publish | POST | \`/api/v1/admin/course-submissions/:id/publish\` | publisher + release gate |
| Withdraw | POST | \`/api/v1/admin/course-submissions/:id/withdraw\` | publisher + release gate |
| Restore prior approved version | POST | \`/api/v1/admin/course-submissions/:id/rollback\` | publisher + release gate |

All mutations enforce same-origin CSRF checks and server-side roles. Audit logs store reasons, actual actor IDs, event times, content fingerprints and release metadata. History is private/no-store/noindex; it does not include private evaluator answer keys.

## Acceptance gates

- \`pnpm check\` + PostgreSQL seed repeatability and the new rollback-only editorial smoke must run green at the PR SHA.
- Negative tests: editor cannot review/publish, reviewers cannot submit/publish, publisher cannot impersonate reviewer, no self-review, checklist omissions, incomplete draft, changed answer keys, duplicate/older version, disabled publish.
- A real staging deploy **and executed** full certification on exact merged SHA. A workflow with skipped browser tests is not evidence.
- A human editor/reviewer/publisher must still produce genuine course-specific decisions. Staging success alone never counts as approval; keep all new courses unpublished until real sign-off.
- The separate product owner must explicitly approve production promotion and subscription marketing claims. No changes to pricing or JazzCash are included.
