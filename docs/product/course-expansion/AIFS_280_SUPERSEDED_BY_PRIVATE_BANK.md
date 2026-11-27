# PR #280 disposition — superseded by private bank (do not merge)

**PR:** [#280](https://github.com/SkillStep/skillup-platform/pull/280)  
**Date:** 2026-11-27  
**Decision:** **Close without merge.** Public evaluator keys must never land on `main`.

## Why #280 stays unmerged

- SkillUp platform repo is public.
- #280 historically shipped draft JSON with evaluator-facing answer material.
- Those Git objects remain reachable forever even if paths are deleted later (#281).
- Launch used the private bank (`SkillStep/aifs-private-assessment-bank`) + owner launch import/publish path instead.

## What already replaced #280’s launch intent

| Need | How it was satisfied without merging #280 |
| --- | --- |
| 400 re-keyed items | Private bank v1; #281 closed |
| Four-role course approvals | #263/#264/#242/#244/#247 closed |
| Staging publish of five courses | Owner launch workflow; catalogue = 10 |
| Certificate policies | #265/#282/#283; issuance enabled on staging edge |
| Exact-SHA QA | #271 closed after main SHA `f471c70…` READY FOR UAT |

## Safe follow-ups (optional)

1. Keep leak scanner / private-bank ops docs current.
2. If any *non-key* importer tooling from #280 is still useful, extract it in a **new** PR with keys stripped and CI leak checks green.
3. Never cherry-pick answer fields from `d70b919…` into `main`.

## Explicit non-actions

- Do **not** merge #280.
- Do **not** re-import public #280 answer fields into staging/production.
- JazzCash / payment credentials remain untouched by this disposition.
