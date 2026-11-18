# Private assessment bank operations — release gate for #281

**Status:** mandatory security gate before publishing the five team courses or enabling certificate eligibility on new assessments.  
**Parent:** [#281](https://github.com/SkillStep/skillup-platform/issues/281), launch matrix [#271](https://github.com/SkillStep/skillup-platform/issues/271), draft content [#280](https://github.com/SkillStep/skillup-platform/pull/280).

## Why this exists

`SkillStep/skillup-platform` is a **public** repository. Candidate answer keys that landed in public draft JSON (PR #280 `docs/product/course-expansion/drafts/team-five/**`) are treated as **exposed**. Deleting or renaming a file does **not** make prior Git history secret. Final high-stakes assessment material must be:

1. Independently rewritten / re-keyed by content + subject review.
2. Stored only in a protected editorial source (private repo, authenticated CMS, or staging DB import path with scoped access).
3. Verified absent from public tree, built web bundles, CDN/static assets and unauthenticated APIs.

## Allowed public material

Public GitHub may keep:

- Course outlines, titles, module names and non-keyed teaching prose intended for Coming soon cards.
- Schemas, validators, importers and **synthetic** fixture challenges clearly marked non-production.
- Capstone instructions that do not embed deterministic evaluator keys.

Public GitHub must **not** keep:

- Final `"answer"` / `privateEvaluation` / `correctOptionKeys` banks for release courses.
- Baseline/endline assessment keys destined for certificate or Premium completion scoring.
- Exported reviewer packets that include private keys (use authenticated admin export only).

## Local / staging private bank path

Operators place rewritten banks outside the public tree:

```text
private-editorial/assessment-banks/
  <course-slug>.practice.json
  <course-slug>.assessments.json
```

That directory is gitignored except its README. Import only through the existing non-production draft importer after:

```bash
# Confirm target is staging/local, never production.
APP_ENV=staging AIFS_ALLOW_DRAFT_IMPORT=yes \
  pnpm --filter @skillup/database aifs:team-five:import-draft
```

Exact import flags follow the course PR runbook once the private bank is approved. Do not paste staging `DATABASE_URL` into chat logs or issues.

## Leak scan

Run before merge and in CI:

```bash
pnpm catalog:assessment-security:check
```

The scanner **fails closed** if `docs/product/course-expansion/drafts/team-five/**/*.json` embeds release-shaped evaluator keys (for example challenge `"answer"` fields).  

Excel pilot drafts under `docs/product/course-expansion/drafts/excel/` are reported as **known public debt** until they are also re-keyed into the private bank; they currently warn rather than fail so existing main CI stays usable while the team-five publish path is blocked. Synthetic test fixtures must live under approved test paths and must not claim `publicationAllowed: true`.

## Human closure checklist for #281

- [ ] Repository visibility decision recorded (remain public with private bank, or move editorial source).
- [ ] 360 practice items independently rewritten; old public keys marked superseded / not for release.
- [ ] 40 baseline/endline candidates independently rewritten into the private bank.
- [ ] `pnpm catalog:assessment-security:check` green on the release candidate SHA.
- [ ] Spot-check built web bundle and public catalog/API for absence of final keys.
- [ ] Two-person content + security acknowledgment linked on #281 with private bank location (not the keys themselves).
- [ ] Only then may course editorial approvals (#263/#264/#242/#244/#247) proceed toward publisher release.

## Explicit non-goals

- This document does not approve courses, certificates, production deploy or JazzCash changes.
- Passing CI is not subject-matter correctness.
- Obfuscation, encryption-at-rest in the public repo, or “deleted in latest commit” are not remediations for exposed keys.
