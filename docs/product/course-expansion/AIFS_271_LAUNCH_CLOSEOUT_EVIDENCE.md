# AIFS #271 launch closeout evidence (branch work)

**Branch:** `chore/aifs-271-exact-sha-launch-closeout`  
**Tracker:** [#271](https://github.com/SkillStep/skillup-platform/issues/271)  
**Date:** 2026-11-27  
**Rule:** Do not merge this branch to `main` without Abdullah approval. Keep [#280](https://github.com/SkillStep/skillup-platform/pull/280) unmerged (public evaluator keys).

## Live identity (skillupshop.com) — release package certified

Staging Deploy of `release/aifs-271-closeout` tip (pre-main):

| Field | Value |
| --- | --- |
| releaseSha | `d2bbcd19e4e89c793f9207a915793930dd33103a` |
| pipelineId | `45978093468-1` |
| deploy run | https://github.com/SkillStep/skillup-platform/actions/runs/45978093468 |
| webArtifactRef | `ghcr.io/skillstep/skillup-platform-web:d2bbcd19e4e89c793f9207a915793930dd33103a` |
| webImageDigest | `sha256:e6a3e5048f48783bc6012be080a9bda76eecb4d8dc5712b7aae0a62857925573` |
| apiArtifactRef | `ghcr.io/skillstep/skillup-platform-api:d2bbcd19e4e89c793f9207a915793930dd33103a` |
| apiImageDigest | `sha256:ff7f8d2944bff6a9136e8ff18e6a265e99123c4f5ea60b92be2a7158a541ac61` |
| aiArtifactRef | `ghcr.io/skillstep/skillup-platform-ai-worker:d2bbcd19e4e89c793f9207a915793930dd33103a` |
| aiImageDigest | `sha256:eb38f29d5380ac24744337483b59d33a254525135f892998faa2187ece1c8a46` |
| previousReleaseRef / rollback | `ghcr.io/skillstep/skillup-platform-web:1a5f068dc65c1c236a7eb1ec84b24dae6a49d1ed` |

## Content / policy gates already cleared (prior session)

| Gate | Status |
| --- | --- |
| #281 private bank 400/400 | Closed |
| Four-role approvals #263/#264/#242/#244/#247 | Closed |
| #265 Product + Legal certificate policy | Closed |
| #282 / #283 engineering | Merged |
| Team-five publish + certificate issuance flag | Enabled via owner launch workflow `45971541166` |
| Public catalogue | **10** playable courses on skillupshop.com |
| #280 | **Still blocked** — do not merge |

## Exact-SHA certification + history audit (completed on this branch)

| Check | Result |
| --- | --- |
| Staging Certification run | [45978853133](https://github.com/SkillStep/skillup-platform/actions/runs/45978853133) **success** (prior: 45975932891) |
| Playwright | **135 passed**, 2 skipped (JazzCash classified), 0 failed → `READY FOR UAT` |
| Edge certified | https://skillupshop.com @ `d2bbcd1…` |
| Certificate history dry-run | **AUDITED_NO_WRITES** (same run, parallel job) |
| policyCount | 10 |
| totalCandidates / examined | 10 / 10 |
| frozenAwardEvidenceAnomalies | 0 |
| awards issued by audit | **0** (read-only) |

PR path: [#289](https://github.com/SkillStep/skillup-platform/pull/289) → `release/aifs-271-closeout` → [#290](https://github.com/SkillStep/skillup-platform/pull/290) → `main` (**single main merge when Abdullah approves**).

## Skipped Playwright tests — classified (non-blocking)

Both skips are the **same** JazzCash checkout test on two projects:

| Project | Test | Reason |
| --- | --- | --- |
| learner-desktop | checkout creation is replay-safe… | `STAGING_JAZZCASH_SANDBOX_READY` is not `true` |
| learner-mobile | checkout creation is replay-safe… | same |

**Classification:** expected / non-critical for this launch closeout. JazzCash sandbox and merchant credentials were **explicitly not changed**. Negative JazzCash callback/malformed tests still executed and passed. Enabling sandbox to unskip would violate the JazzCash no-touch rule.

## Explicit non-goals

- No JazzCash / payment / merchant credential changes.
- No merge of #280.
- No merge to `main` until Abdullah approves **#290** once.
- No separate `promote-production.yml` cut unless a separate written GO is recorded.
