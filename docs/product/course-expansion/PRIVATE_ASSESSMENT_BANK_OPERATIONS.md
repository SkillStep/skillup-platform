# Private assessment banks — release gate and operator guide

**Status: ENGINEERING PREFLIGHT ONLY. NOT a secure bank service, an importer, a human approval, or permission to publish.**
Related: [#281](https://github.com/SkillStep/skillup-platform/issues/281), [#271](https://github.com/SkillStep/skillup-platform/issues/271), [#280](https://github.com/SkillStep/skillup-platform/pull/280).

## Core risk

SkillStep/skillup-platform is **public**. PR #280 and earlier Excel draft history exposed candidate scoring answers. Those exact published Git objects must be considered permanently accessible. Removing or renaming a path will not make the old answers confidential. Do not certify a course with questions that can be answered from those public keys.

The five new courses require **360 practice + 40 baseline/endline = 400 independently rewritten and corrected candidate questions**. AI may help propose them, but only real authenticated subject reviewers may attest accuracy and rights. The 40-item assessment target means **four baseline and four endline questions per course**.

## Where to store final evaluator keys

**Use a separately provisioned, access-restricted editorial storage source**: a *private* GitHub repository with explicitly limited reviewers, an authenticated content CMS, or a protected DB object store. Have an authorized Security Reviewer verify encryption, backups, audit logs, access lists, CI runner permissions and restoration controls. Never assume a gitignored directory is secure.

**Do not put real final banks under the public checkout**, including the gitignored folder at private-editorial/assessment-banks/, unless it is strictly ephemeral local staging for controlled import; it does not constitute approved shared storage, and backups/agent access may still expose it. Prefer a sibling protected checkout/mount outside the repo, restricted to the authorized operator. Never commit an example with real keys, publish a bank checksum together with answer text, or paste keys into a GitHub issue.

For a secured external mount, expected private files:

    <EXTERNAL_PRIVATE_BANK_ROOT>/
      prompt-engineering-generative-ai.practice.json
      prompt-engineering-generative-ai.assessments.json
      cybersecurity-digital-safety.practice.json
      cybersecurity-digital-safety.assessments.json
      data-analytics-dashboards.practice.json
      data-analytics-dashboards.assessments.json
      applied-ai-workflows.practice.json
      applied-ai-workflows.assessments.json
      sales-client-negotiation.practice.json
      sales-client-negotiation.assessments.json

Use owner-only Linux permissions (directory 0700, files 0600). Files cannot be symlinks. The QA validator refuses an assessment root inside the public checkout.

## Assessment bank contract (private only)

Each file contains JSON with courseSlug, a non-empty immutable version string, and items.
For **practice**: exactly 72 items, three uniquely scored items for each levelNumber 1–24.
For **assessments**: exactly 8 items, four baseline + four endline, matched in outcome/difficulty by the human reviewer and not reused practice keys.
Every item must include:
- id: globally unique, stable opaque question ID
- prompt: meaningful original subject-specific question (at least 30 characters)
- choices: array of 2–6 objects {id, label}
- correctChoiceId: MUST match a choice ID; **must never enter public web bundles**
- explanation: original correct-answer reasoning and remediation
- sourceReference: approved citation or original-content provenance
- levelNumber for practice OR phase = baseline/endline for assessments

The validator checks syntax, IDs, counts, choice key membership, exact duplicate questions, basic presence of explanations and operating-system path restrictions. **It cannot certify expert accuracy, legitimate source licensing, near-duplicates, psychometric validity, immutable DB import, security of a CMS, or any human signature.** Treat validator output as technical-only evidence.

Run **from the repository root**, only on the secured operator's machine:

    export AIFS_PRIVATE_BANK_ROOT=/absolute/path/to/protected/external-bank
    pnpm catalog:assessment-bank:validate

This is **read-only**. It prints only aggregate counts (5 courses, 360 practice, 40 assessment, 400 total), NEVER prompts, answer values, or bank file contents.

## CI public-tree key gate

    pnpm catalog:assessment-security:check

The CI scanner checks Git-tracked source material, including force-tracked banks beneath the misleading private-editorial path and relocated team-five candidate keys in other public paths. It flags key-bearing team-five files and warns about already-public Excel pilot keys. **It does not scan Git history, untracked external banks, production artifact bundles, URLs, private databases or CDN responses.** All of those require separate security inspection and signed release evidence. A passing scan means only *no detected release-shaped answer fields in the scanned tracked tree*.

Before any course publishing, also inspect:
- public Git commit history for old candidate keys and mark them superseded;
- actual built web/API/worker images, source maps, CDN routes and public API JSON for FINAL private answer fields;
- unauthorized actors (anonymous, Free, expired Premium, another learner) must not see evaluator keys;
- account and secret scopes, backup/restore and private-editorial access logs.

## Staging import is a separate step — NOT implemented by this preflight

The current PR #280 draft content was historically authored in public JSON. **Do not run its existing draft importer with the exposed answer fields and call it remediated.** A developer must explicitly implement/review a secured, staging-only importer that consumes the authenticated external bank and maps it to versioned draft content without publishing or overwriting learner progress. It must prove 400 privately re-keyed entries were consumed from the approved source, match the reviewed immutable content digest, prevent public key returns, and be database-transactional/idempotent. Real QA must then verify all 120 playable levels, scoring and capstones.

## #281 closure: must be real signed evidence

- [ ] Security Owner records the approved **actual private repository/CMS**, restricted principals and access audit.
- [ ] Content Lead submits 400 genuinely rewritten private candidate items, provenance and per-course review.
- [ ] Subject experts verify accuracy, option discrimination, baseline/endline separation, rubric, answer tests and accessibility.
- [ ] Technical preflight passes with exactly 400 items. Record aggregate results, not answers.
- [ ] Server-side integration imports only approved new immutable draft versions, never exposed questions.
- [ ] Public Git tracked-tree scan, historical-risk register, built bundles and unauthenticated API inspections are reviewed.
- [ ] Two named **real humans**, Content Lead and Security Reviewer, both sign #281 (without posting any answer keys).
- [ ] Only then may independent course-review and per-course publisher workflow proceed on the exact corrected version.

**#280:** do not merge (public keys). Launch used this private bank instead — see `AIFS_280_SUPERSEDED_BY_PRIVATE_BANK.md`.  
**#265 / #271:** policy + exact-SHA QA closed for the staging edge launch.  
Separate `promote-production.yml` remains an owner-gated step. No pricing/JazzCash changes are authorized by this file.
