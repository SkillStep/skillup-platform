# Existing five-course content quality audit (AIFS)

**Status:** Source-based engineering audit, not an editorial review or release sign-off.

Run at repository root:

```bash
node --import tsx tools/audit-existing-launch-courses.mjs
node --import tsx tools/audit-existing-launch-courses.mjs --json
node --import tsx --test tools/audit-existing-launch-courses.test.mjs
```

The audit reconstructs the deterministic challenge templates used by `complete-launch-seed-v2.ts` for the five existing course curricula without opening a database connection, modifying content, publishing, or requiring a secret. All three interactions per canonical level are template-generated and therefore flagged for content remediation; **template rotation across seven formats is not the same as seven independent teaching approaches**.

Baseline: five curricula, 68 canonical levels and 204 template-generated challenge slots. The old interview pilot remains **one separate database level / two extra challenges**, explaining the seed baseline of 69 levels / 206 challenges. This is a source audit; individual staging/live versions and learner-attempt histories still need separate verification.

## Acceptance for #226

1. For each listed course and canonical level, independently draft real subject-specific prompts, correct keys, distractors, feedback and a remedy after incorrect answers. Do not merely rephrase the generic “confirm the requirement, check evidence, act” template.
2. Do not edit historically published versions or old learner attempts in place. Use a new immutable version through an audited human-controlled publishing workflow (#229).
3. Review subject accuracy, English/Urdu clarity, accessibility, rights, source provenance and baseline/end learning assessments. Capture **real** reviewer, editor and publisher sign-offs.
4. Test correct and incorrect evaluation, prerequisites, progression, mobile access, entitlements and exact-SHA staging playback. Maintain public truthfulness.
5. Re-run this source audit and track separately how many reviewed replacement versions were actually accepted. **The existence of this report does not increase that count.**

This is deliberately a detection/reporting tool rather than a CI failure on existing content; blocking CI before revised material and a versioned release path exist would not safely remediate the current published courses.
