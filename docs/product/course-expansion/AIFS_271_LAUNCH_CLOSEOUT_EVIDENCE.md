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

## Remaining #271 engineering on this branch

1. Exact-SHA `Staging Certification` against `1a5f068…` on **https://skillupshop.com** (not lagging codistan.org).
2. Read-only certificate history dry-run on staging (`AIFS Certificate History Dry Run`).
3. Record CI run links + redacted aggregates back onto #271.
4. Open PR from this branch; merge only with Abdullah approval.

## Explicit non-goals

- No JazzCash / payment / merchant credential changes.
- No merge of #280.
- No production promotion beyond the already-live skillupshop.com staging edge unless a separate written GO is recorded.
