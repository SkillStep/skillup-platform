# AI-first authoring and review contract — SkillUp v1

**Status:** Draft implementation contract. This file authorizes creating drafts and tests, **not automatic publication**.
**Companion:** `catalog-plan-v1.json` and `AI_FIRST_20_COURSE_EXPANSION_ROADMAP.md`.

## Design principles

AI can propose a course outline and original content, but it cannot certify the correctness of its own outputs, source authenticity, learning outcomes, learner safety or publication approval. No AI-generated level should be shown as reviewed until an authorized human has actually reviewed it.

Existing launch challenges in `packages/database/src/complete-launch-challenges.ts` are useful as an interaction-type scaffold, **not** acceptable final learning content. The same generic requirement/evidence/action prompt should not be repeated across 20 courses.

## Bounded generation stages

1. **Input and assignment:** verified course brief, audience, prerequisite, module and level learning outcome, difficulty, Pakistan context, permitted sources with license, owner identity, review deadline.
2. **Outline draft:** propose exact six progressive levels per module, prerequisite order, initial and final assessment questions and a real capstone rubric. Never publish at this stage.
3. **Level draft:** generate original teaching note, 3–5 format-appropriate challenges, correct keys/feedback and at least one realistic subject-specific scenario. Include hints, an alternative explanation and misconception to correct.
4. **Independent checks:** validate JSON against `@skillup/content-schema`; evaluation payload matches challenge type; no impossible tasks, unlicensed assets, unsupported claims, duplicate questions, privacy violations, inaccessible interaction, biased distractors, invented reference, or repeated cross-course boilerplate.
5. **Expert edit:** subject editor checks accuracy/answer logic, language/accessibility editor checks readability, publisher checks all required evidence. Preserve editable draft history.
6. **Versioned import:** `--dry-run` first; idempotent import of approved versions; require real reviewer and publisher account and audit reason. Published versions and past attempts must not be modified in place.
7. **Staging verification:** test all 24 playable levels, assessment, progress, free/Premium boundary, project instructions and mobile accessibility. Explicit production approval only after passing.

## Structured level draft fields (implementation target)

- Identity: courseSlug, moduleSlug, levelSlug, locale, version, intendedDifficulty.
- Learning: objective, estimatedMinutes, prerequisiteLevelSlugs, shortExplanation, workedExample, commonMistake, remediation, referenceClaims.
- Challenges: each with supported `type`, unique practical `prompt`, localized case context, choices/payload, private evaluation criteria, correct explanation, hint and misconception.
- Assessment: checkpointType (baseline/practice/mastery/capstone), rubric, observable success threshold and re-attempt rules.
- Provenance: generatedAt, modelIdentifier, promptTemplateVersion, inputDigest, permittedSourceIds, factualReviewNeeded, estimatedGenerationCost.
- Governance: status **draft**, requestedBy, subjectReviewer, languageReviewer, approvedBy, reviewedAt, publishedAt, originalContentVersionRef.
- Safety: any personal data input prohibited from content-generation requests by default; do not store real learner CVs, financial data or phone messages in draft fixtures.

All flags that denote review/approval must be populated by authenticated human actions, **never by model output**.

## Uniqueness and accuracy checks

- Normalize prompt text, answer explanations and distractors; flag exact and near-duplicate content within each course and across courses.
- Consider optional embedding-based similarity to flag borderline repetition for manual review, not a sole automatic verdict.
- Verify correct keys evaluate correctly in the existing game engine; false answers are rejected; ordering, matching and fill-in alternatives use realistic solutions.
- Challenge difficulty must increase across each six-level module and connect with the level objective.
- Sample test scenarios must look like real Pakistani workplace, small-business, study or creator tasks without promising earnings or regulated outcomes.
- All time-sensitive external platform facts require source and last-reviewed date.
- English first; prepare translatable text with no hardcoded language assumptions. Urdu versions require separate language review.
- Each practical capstone includes reusable instructions, an optional local/downloadable starter asset where supported, evaluation checklist and a clear outcome. Do not claim teacher grading if only self-assessment exists.

## Pilot generation prompt template (for an AI coding/content agent)

> Produce a **DRAFT ONLY** learning level for SkillUp. Input: approved course and module brief, explicit outcome, audience, prerequisite, supported challenge schemas, allowed source references, difficulty and country context. Draft a unique short explanation, three pedagogically distinct subject-specific interactions, correct/private evaluation keys, feedback for likely mistakes, helpful remediation, accessible alternative if needed, and source provenance. Use realistic original examples; no guaranteed income, fabricated citations or recycled “confirm-check-act” boilerplate. Mark every factual uncertainty for subject review. Output schema-valid structured data only. Do not set reviewedAt, approvedBy, publishedAt, or any published status.

For the AI coding agent: create one small PR per change set, with tests and evidence. Do not auto-merge, run production migrations, invent credentials, bypass reviewer separation or deploy live content.

## Rejection reasons and feedback loop

Record one or more codes per rejected draft: `incorrect_fact`, `invalid_answer_key`, `duplicated_content`, `misaligned_objective`, `too_easy_or_hard`, `unlicensed_or_unknown_source`, `privacy_risk`, `inaccessible`, `language_clarity`, `platform_outdated`, `unsafe_or_overpromising`. Store reviewer corrections and feed only approved, anonymized editorial patterns to future prompts.

## Human sign-off and responsibilities

The product lead approves course intent and availability; subject reviewers validate content and assessment; an independent editor validates clarity/accessibility; the publisher authorizes exposure of approved immutable content. For financial literacy, claims about financial products require explicit elevated review.

A source reference field is not proof the source was checked. A green generation job is not publication approval.

## Metrics

Record AI spend per approved level; draft-to-approval conversion; mean editorial minutes per level; duplicate rate; challenge-format mix; learner wrong-answer patterns; explanation helpfulness; real first-week project completion; complaints per 1,000 starts. Compare against a reviewed pilot, not arbitrary click-through counts.

All data is collected subject to existing privacy/consent policy. Use provider budgets and a bounded retry policy; stop generation when schema or provenance checks fail.

## Release and rollback

The planning manifest is not a published catalogue. Production discovery must query only published, approved versions. If a version receives credible accuracy/copyright/safety complaints, hide it from new starts pending review; preserve history for previously completed attempts. Correct via a new immutable version and audit event.
