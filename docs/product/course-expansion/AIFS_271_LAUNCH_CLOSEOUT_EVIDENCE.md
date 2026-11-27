# AIFS #271 launch closeout evidence (branch work)

**Branch:** `chore/aifs-271-exact-sha-launch-closeout`  
**Tracker:** [#271](https://github.com/SkillStep/skillup-platform/issues/271)  
**Date:** 2026-11-27  
**Rule:** Do not merge this branch to `main` without Abdullah approval. Keep [#280](https://github.com/SkillStep/skillup-platform/pull/280) unmerged (public evaluator keys).

## Live identity (skillupshop.com)

Captured after Staging Deploy `45971531718` and launch activation:

| Field | Value |
| --- | --- |
| releaseSha | `1a5f068dc65c1c236a7eb1ec84b24dae6a49d1ed` |
| pipelineId | `45971531718-1` |
| webArtifactRef | `ghcr.io/skillstep/skillup-platform-web:1a5f068dc65c1c236a7eb1ec84b24dae6a49d1ed` |
| webImageDigest | `sha256:24daaffebd274b146b1553cca977fe759ca39d77392fd6e74df8a89bce1f53c9` |
| apiArtifactRef | `ghcr.io/skillstep/skillup-platform-api:1a5f068dc65c1c236a7eb1ec84b24dae6a49d1ed` |
| apiImageDigest | `sha256:0f65a3a4b3e5fbf26daf18bef3cf7ad61b0795eeb3c39ed866466e4ada57e69f` |
| aiArtifactRef | `ghcr.io/skillstep/skillup-platform-ai-worker:1a5f068dc65c1c236a7eb1ec84b24dae6a49d1ed` |
| aiImageDigest | `sha256:eb7eef91d2b632c32fd0591a6c6abbebab6496a605ca0a0de11e72b10ad84374` |
| previousReleaseRef / rollback | `ghcr.io/skillstep/skillup-platform-web:ccd16674409756c8aaa62884cf2c63409dd434af` |

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
| Staging Certification run | [45975932891](https://github.com/SkillStep/skillup-platform/actions/runs/45975932891) **success** |
| Playwright | **135 passed**, 2 skipped, 0 failed → `READY FOR UAT` |
| Edge certified | https://skillupshop.com @ `1a5f068…` |
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
