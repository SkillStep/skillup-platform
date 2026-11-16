# SkillUp certificate QA — mobile, history, release handover

**Status:** Development QA implemented on [PR #283](https://github.com/SkillStep/skillup-platform/pull/283), stacked on [policy PR #282](https://github.com/SkillStep/skillup-platform/pull/282). **Neither a staging deployment nor policy approval is implied.** User certificates/production unchanged.

## What is automated

1. **Real PostgreSQL certificate test** — `pnpm db:smoke`: creates *transaction-only test users* and complete required published level/challenge attempts, then proves 79% fails, 80% passes, missing/unauthorized capstone fails, approved independent reviewer passes, no other skill inherits a credential, exactly one award issues, another account cannot download it, and immutable award events cannot be tampered with. All fixture writes roll back.
2. **Historical scan** — `pnpm certificates:history:check` verifies the history-auditor's privacy, complete coverage/limit handling and negative cases. The database smoke also reconciles the same synthetic historical candidate from eligible-but-not-issued to exactly one immutable issued award.
3. **Real browser responsive QA** — Quality CI runs **nine Chromium tests** against the just-built Web/API containers: desktop, Pixel 7 and iPad Mini; a 320 px narrow viewport in each project; sign-in/privacy, all 10 cards, issued/revoked/long titles, PDF link and keyboard controls. These tests intercept only synthetic certificate JSON; all surrounding HTML/CSS is genuinely rendered in Chromium. The shared footer has been corrected to prevent width overflow.
4. **Real staging authenticated learner checks** — when explicitly deployed at an exact SHA, the existing `learner-desktop` and `learner-mobile` staging projects now test private list cache/noindex, exact 10 eligibility API routes, learner-only rendered inventory and horizontal overflow. These are **separate from synthetic container tests**.

## QA evidence

Open the most recent [PR #283 Actions](https://github.com/SkillStep/skillup-platform/pull/283/checks). Both **Quality CI** and **Repeatable Seed** must show success on the *exact same PR HEAD SHA*. In Quality CI find `certificate-browser-qa-<sha>`, which contains the three synthetic viewport screenshots and Playwright JSON. Do not present these mock screenshots as proof of real learner accounts.

## Historical completion verification — real staging (read-only)

Developer / QA operator runs on an **authorized staging machine**, with the staging database URL sourced from its protected environment; **do not paste a connection string or user account data into Slack, PR logs or screenshots**. Use a database login with **SELECT-only** privilege wherever possible.

```bash
export APP_ENV=staging
export AIFS_CERTIFICATE_BACKFILL_DRY_RUN=yes
export AIFS_CERTIFICATE_HISTORY_LIMIT=5000
# DATABASE_URL is supplied privately by staging infrastructure; never echo it.
node --import tsx tools/aifs-certificate-backfill-dry-run.mjs
```

The command starts a **repeatable-read, read-only transaction** and issues **no certificates or writes**. It prints only aggregate per-skill totals:

- `candidateCountTotal` and `examinedCandidates` prove whether every candidate was assessed; `candidateLimitHit` and `fullCoverageProven=false` **block** certification.
- `eligibleButNotIssued` is an **audit queue**, **not permission to issue or backfill**.
- `alreadyIssued` reports existing awards; `frozenAwardEvidenceAnomalies` flags suspect snapshots/event history.
- `legacyProgressOnly` separates historical progress counters that **cannot** substitute for real completed sessions/attempts.
- `frozenAwards.revoked` and `fromPriorRequirementVersions` need case-by-case owner/QA review, not automatic changes.
- `NO_ACTIVE_POLICY_CANNOT_CERTIFY` means policy #265 is not active: no historic eligibility claim may be made. The command exits non-zero instead of fabricating a pass.
- If `candidateLimitHit`, rerun read-only with a larger explicit limit up to 100000 (if approved and practical); a sampled report must never be labeled a full audit.
- Store the redacted aggregate JSON plus staging **release SHA**, execution time and genuine QA operator signoff in **Issue #271**.

**No live staging historical audit has been executed or its learner counts independently verified from this GitHub PR alone.** The previous live state and any results remain unverified until a real authorized run is attached.

## Real staging mobile and permission verification

1. Deploy a separately authorized reviewed build of the exact merged SHA to **staging only**, document Web/API image digest, deployment pipeline ID and previous release ref. Confirm `/api/health` and `/api/v1/version` return that SHA.
2. Use isolated authorized **staging QA accounts** (active Premium, Free, expired/cancelled, newly signed-up, reviewer and an unrelated learner). Never seed fake approvals into production, and do not record names/emails in screenshot artifacts.
3. From the QA runner configured for the **same deployed SHA**, run existing staging certification plus the new `certificates-authenticated.spec.mjs` on `learner-desktop` and `learner-mobile`. Check the page at 320 px, a Pixel 7 and tablet, using real, not mocked, API responses.
4. Where the certificate policy is not yet approved/activated, assert **unavailable and no awards**: do not enable `SKILLUP_CERTIFICATE_ISSUANCE_ENABLED` just to make a green test. Full real award testing is scheduled *after* authorized policy, learner and capstone fixtures exist.
5. With authorized *nonproduction* release fixtures, independently confirm 79% fails, 80% qualifies with every mandatory correct challenge, actual human capstone, replay dedupe, expired Premium PDF re-download, other-user ID 404, revoked award PDF 404, no public verification and all 10 skill-version relationships. Archive screenshots only after scrubbing PII.
6. Record real browser/project/device names, exact SHA, checks, test counts, immutable CI links, aggregate history report, product/legal approvals and named QA/DevOps go/no-go in #271.

### Remaining release gates

- **Product owner / Legal:** genuinely approve 80% policy, retake rules and the certificate language in #265 (not signed by ChatGPT).
- **Content:** human review + publication of each new course; private approved answer keys must supersede the previously public draft answers (PR #280 / Issue #281).
- **Staging/QA:** authenticated device suite, real read-only historical sweep, capstone review authenticity, non-Latin PDF names, current user entitlement expiry and exact-SHA deployment certification.
- **Release owner:** separate explicit production deployment authorization. **Issuance, backfill and public verification stay OFF** until all required approvals.

This handover documents automated implementation and the independently remaining human/environment checks without marking unexecuted work as passed.
