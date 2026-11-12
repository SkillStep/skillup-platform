# SkillUp 360-level AI-first curriculum brief pack

**Status:** Authored outline briefs; not teaching content, not 360 playable levels, not publication approval.
**Scope:** 15 *new* proposed courses × four modules × six distinct level titles = **360 level briefs**, plus one distinct practical capstone per course. The five existing published learning paths remain unchanged.

## What is completed in this pack

- Every proposed course now has its own `outlines/<course-slug>.json` file.
- Each file contains the 24 level titles, ordered under four coherent modules with a subject-specific module outcome and scenario seed.
- Examples in this pack match the Pakistan-first audience: job applications, practical digital design, marketing, customer service, editing, business websites, commerce and everyday budgeting.
- An automated validator rejects incomplete module maps, generic/duplicate titles, mismatch against the master 15-course manifest, or fake editorial/publishing status.
- The job brief generator produces **360 draft-only `generate_level` request specifications**. This is not a provider call and does not spend money or publish content.

## Operating commands

After installing the workspace dependencies:

```bash
node tools/validate-aifs-curriculum-briefs.mjs
node --test tools/validate-aifs-curriculum-briefs.test.mjs
node tools/validate-aifs-curriculum-briefs.mjs --jsonl
```

The JSONL command writes 360 structured briefs to standard output for an AI-first generation pipeline; it does not submit requests. Each brief carries one level objective/title, module brief, original scenario seed, capstone, English locale, country, privacy boundaries, three-distinct-challenge requirement and explicit *unreviewed draft* status.

## Next generation and review steps

1. Generate original teaching text, a worked example, hints, corrections, **three or more meaningful challenges** and corresponding *private* evaluation keys for **every one** of the 360 briefs. Track model, prompt version, sources, costs and rejected drafts.
2. Check objective match, mathematical/factual correctness, answer-key evaluation, duplication against all existing modules, licensing, mobile usability and accessibility. Implement the approved output contract rather than uploading fabricated status flags.
3. Have actual subject-matter reviewers, language/accessibility reviewers and authorized publishers approve every immutable course version. Preserve reviewer IDs, dates and evidence.
4. Build a generalized transactional draft importer using the Excel pilot pattern. No content is inserted into production or published by this outline pack.
5. Verify each level through the learner engine, all 15 projects, progress and Premium entitlement rules on staging. **No production rollout unless explicitly authorized**.

## What still needs real human participation

AI-drafted lesson content is not evidence of educational accuracy. For regulated or sensitive subjects, such as personal budgeting, require elevated fact review. Do not claim that a learner will get a job, earn a certain income, receive an accredited certificate, or access unreleased levels. Pricing remains PKR 990/month unless product and billing owners separately approve a change.

Do not mark the course expansion epic as fully complete simply because 360 level titles and AI briefs exist. A course is **complete only when it is human-reviewed, versioned, published, playable and staging-certified**.
