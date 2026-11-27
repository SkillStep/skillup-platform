# AIFS production promotion readiness (post-#271)

**Branch work:** prepare gates only. Dispatch `promote-production.yml` only with phrase `PROMOTE-CERTIFIED-STAGING-ARTIFACTS` and Abdullah GO.

## Current live staging edge

- URL: https://skillupshop.com  
- Certified closeout SHA (content + certs): `f471c7032071edb43ba123510e2690921ea8c125`  
- Staging Deploy identity: run `45979680800` attempt `1`  
- Staging Certification READY FOR UAT: run `45986824302`  
- Catalogue: 10 courses; certificate issuance enabled on this edge  

Note: later `main` commits (e.g. payment/ngrok) may exist that **failed** Staging Deploy; live edge remains on `f471c70…` until a newer deploy succeeds.

## Gate that was missing

Manual `Staging Certification` did **not** publish `staging-certification/live` on the exact release SHA (only `staging-certification-after-deploy.yml` did).  
This branch adds a `report-status` job so workflow_dispatch certification posts that status — required by `promote-production.yml`.

## Promotion checklist (before dispatch)

1. `staging-certification/live=success` on the **exact** candidate SHA.
2. Successful Staging Deploy run ID/attempt + `staging-deployment-identity` artifact for that SHA.
3. Production environment reviewers configured; `PRODUCTION_PUBLIC_URL` is HTTPS and **not** the staging hostname if a separate prod host is required.
4. JazzCash / Premium / AI flags remain separately approved (promotion does not flip them).
5. Owner types `PROMOTE-CERTIFIED-STAGING-ARTIFACTS`.

## JazzCash certification skips

Still classified non-blocking while sandbox is off. Do not enable JazzCash credentials solely to unskip checkout tests.

## #280

Superseded by private bank — see `docs/product/course-expansion/AIFS_280_SUPERSEDED_BY_PRIVATE_BANK.md`. Do not merge.
