# Manual Launch Test Plan

This checklist starts only after the reviewed release is deployed to isolated staging. Record tester, device, browser, timestamp, release SHA, result, evidence link and defect reference for every case.

## Exit rule

Production traffic must not be enabled when any critical/high defect is open, payment reconciliation is incomplete, provider credentials are unapproved, recovery has not been rehearsed, or the deployed SHA differs from approved release evidence.

## 1. Environment and release identity

- [ ] Staging uses an isolated database, SMTP sender, AI key and JazzCash sandbox merchant.
- [ ] `/v1/version`, web release metadata and release evidence show the same SHA.
- [ ] Database migrations complete once and remain replay-safe.
- [ ] Web, API and AI-worker images are the reviewed immutable images.
- [ ] Production feature flags remain off while staging tests run.
- [ ] Secrets are absent from source, browser bundles, logs and artifacts.

## 2. Public discovery and mobile PWA

Test at 360×800, 390×844, tablet and desktop widths.

- [ ] Home, skills, category, path and pricing pages render useful HTML without JavaScript.
- [ ] Metadata, canonical, robots and visible copy agree.
- [ ] Pricing displays PKR 599 monthly and PKR 4,999 yearly.
- [ ] Public pages remain readable at 200% zoom.
- [ ] Keyboard-only navigation reaches every control in logical order.
- [ ] Screen-reader headings, labels and status messages are meaningful.
- [ ] PWA install works on supported Android browsers.
- [ ] Offline cache contains only explicitly public resources.
- [ ] Account, gameplay, progress, membership and admin pages are not cached publicly.
- [ ] Slow 3G and interrupted connection produce recoverable states.

## 3. Identity and profile

- [ ] New learner receives a real sign-in code through the approved staging sender.
- [ ] Invalid, expired and reused codes fail without revealing account existence.
- [ ] Rate limits work for email and source fingerprint.
- [ ] Session cookie is Secure, HttpOnly and SameSite in staging.
- [ ] Onboarding saves only the authenticated learner’s profile.
- [ ] Sign-in preserves intended return path.
- [ ] Logout revokes the server session and clears the cookie.
- [ ] Expired/idle sessions return to sign-in safely.
- [ ] Untrusted-origin state-changing requests are rejected.

## 4. Learning journey

- [ ] Learner enters the reviewed pilot from public discovery.
- [ ] Repeated/multi-tab starts resume one authoritative active session.
- [ ] Correct and incorrect attempts return useful explanations.
- [ ] Retry bounds and idempotency prevent duplicate points.
- [ ] Refresh and device interruption resume the exact challenge/version.
- [ ] Completion writes progress, points, streak and badge evidence once.
- [ ] Progress page reflects completed activity.
- [ ] Another account cannot read or mutate the learner’s session/progress.
- [ ] Historical attempt remains attached to the exact published content version.

## 5. Premium offer and account

With checkout disabled:

- [ ] Pricing is public but the provider button says merchant activation is pending.
- [ ] Free learning remains usable.
- [ ] Membership page requires authentication and is noindex/no-store.

With staging checkout enabled:

- [ ] Unauthenticated checkout returns to sign-in and back to pricing.
- [ ] Monthly and yearly amounts match the selected versioned plan.
- [ ] Repeated click/network retry creates one order per idempotency key.
- [ ] Provider handoff is allowed by CSP only for the configured HTTPS origin.
- [ ] Browser return reaches the membership page rather than raw provider/API output.
- [ ] Successful payment activates exactly one entitlement.
- [ ] Pending payment does not grant access.
- [ ] Failed, cancelled and expired payment do not grant access.
- [ ] Duplicate callback does not duplicate entitlement or revenue.
- [ ] Wrong amount/currency/signature opens no entitlement and creates review evidence.
- [ ] Refund updates access while preserving learning history.
- [ ] Membership history shows safe references and current status.

Complete every scenario in `docs/payments/JAZZCASH_INTEGRATION.md`.

## 6. AI generation and content operations

- [ ] AI generation remains disabled when feature flag or credentials are missing.
- [ ] Deterministic adapter covers every approved task in CI.
- [ ] Staging live evaluation uses synthetic/public fixtures only.
- [ ] Bounded request rejects more than 100 items.
- [ ] Original provider output is immutable.
- [ ] Schema failure, contradiction, unsupported claim, prohibited content, duplicate or low score cannot be approved.
- [ ] Human review records reviewer, decision, reason and optional edit.
- [ ] Only approved artifacts can be published.
- [ ] Rejected artifacts do not appear in learner/public delivery, sitemap or metadata.
- [ ] Rollback preserves original publication and review history.
- [ ] Provider/model/task cost and latency appear in approved evidence.

## 7. Administrative operations

Test each role separately.

- [ ] Non-admin receives 403 and no sensitive response.
- [ ] Content editor cannot publish.
- [ ] Reviewer cannot change entitlement.
- [ ] Publisher cannot reconcile payment unless separately assigned.
- [ ] Payment operator cannot publish content.
- [ ] Support view excludes email, profile free text, secrets and unrelated private data.
- [ ] Every privileged mutation creates append-only audit evidence.
- [ ] Suspended/revoked/expired role loses access immediately after session resolution.
- [ ] Admin console remains noindex/no-store and outside public PWA cache.

## 8. Security and abuse

- [ ] Automated dependency audit has no high-severity production finding.
- [ ] Secret scan passes.
- [ ] CSP, HSTS, COOP, CORP, permissions policy, referrer policy and frame denial are present.
- [ ] API body, parameter, request timeout and rate limits reject abuse safely.
- [ ] SQL injection, reflected content and malformed JSON/form payloads are rejected.
- [ ] Payment callback rejects malformed/oversized fields and invalid hash.
- [ ] Direct object reference tests fail across learners, orders, entitlements and admin targets.
- [ ] Logs redact cookies, authorization, OTP, provider password and secure hash.
- [ ] Account deletion/privacy procedures are reviewed for payment retention obligations.

## 9. Performance and reliability

- [ ] Public landing/pricing pages meet approved mobile performance budgets.
- [ ] API p95 latency is recorded for auth, gameplay, progress, plans and account.
- [ ] Checkout initiation remains within approved latency before provider handoff.
- [ ] Load test covers expected beta concurrency without rate-limit memory growth.
- [ ] Database connection limits remain below provider capacity.
- [ ] AI concurrency/budget/circuit breakers operate under simulated failure.
- [ ] Provider outage leaves orders recoverable and AI jobs retryable/cancellable.

## 10. Recovery and operations

- [ ] Database restore drill completes to an isolated target and verifies critical tables.
- [ ] Release rollback restores previous web/API/AI images and compatible schema behavior.
- [ ] JazzCash kill switch stops new checkout without deleting entitlements.
- [ ] AI kill switch stops generation without affecting gameplay/progress.
- [ ] SMTP disablement fails closed without exposing test codes.
- [ ] Incident contacts, on-call owner, dashboards and alert thresholds are confirmed.
- [ ] Reconciliation, refund and learner-support owners can access only their required tools.

## Production go-live sequence

1. Approve release evidence and manual staging report.
2. Confirm backup and rollback evidence.
3. Configure production secrets while feature flags remain off.
4. Deploy reviewed images and run live smoke.
5. Bootstrap named administrators and verify role separation.
6. Enable SMTP for internal accounts and verify sign-in.
7. Enable premium read-only pricing/account behavior.
8. Enable JazzCash for an internal controlled cohort.
9. Verify first real transaction, entitlement and settlement evidence.
10. Enable reviewed AI task/model combinations one at a time, initially for operator drafts only.
11. Expand beta traffic gradually with hourly reconciliation and error review.
12. Promote wider traffic only after KPIs and incidents remain within approved thresholds.
