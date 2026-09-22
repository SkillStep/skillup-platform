# JazzCash CPS Integration and Activation

## Current safety state

The repository is production-built but JazzCash remains fail-closed by default:

```text
FEATURE_PREMIUM_ENABLED=false
FEATURE_JAZZCASH_ENABLED=false
JAZZCASH_MODE=disabled
```

Do not enable payment traffic until the merchant account, current sandbox URLs, credentials, sandbox scenarios, reconciliation owner and refund process are approved.

## Architecture

1. The authenticated learner selects a versioned plan and supplies a JazzCash mobile number.
2. SkillUp creates an idempotent server-side `payment_order` using the authoritative plan price.
3. The API builds the signed MWALLET `DoTransaction` payload (HMAC-SHA256 secure hash).
4. SkillUp POSTs JSON server-to-server to the configured JazzCash `DoTransaction` URL.
5. The API verifies the secure hash, order reference, PKR currency and exact amount before changing order state.
6. A successful verified response creates exactly one server-authoritative entitlement.
7. Replayed provider responses remain idempotent. Amount, currency and status mismatches open reconciliation cases.
8. Stale pending JazzCash orders can be checked through a signed server-to-server CPS payment inquiry.
9. A payment operator can queue a full provider refund only for a verified successful order. The server supplies the authoritative order amount and currency; the browser cannot choose a refund amount.
10. An accepted CPS refund records provider evidence, marks the order and entitlement refunded, and removes active Premium capability without deleting learning history or audit evidence.

The browser never decides whether premium is active and never receives merchant credentials.

## SkillUp-side CPS readiness

The repository contains the complete internal adapter boundary required before connecting the merchant sandbox:

- signed checkout request generation;
- signed callback verification;
- exact order/amount/currency validation;
- callback replay deduplication;
- entitlement idempotency;
- status-inquiry CPS client;
- refund CPS client;
- bounded provider HTTP timeout and redirect rejection;
- configurable refund request envelope (`refund-request` or `flat`) so merchant-pack variations do not require an application rewrite;
- automatic status inquiry for stale pending orders when CPS is enabled;
- permission-gated payment-operator status and refund queue actions;
- leased/retried background jobs with bounded exponential backoff;
- append-only payment and entitlement evidence;
- reconciliation evidence without storing raw credentials or provider payload secrets;
- kill switch through the JazzCash feature flag and mode.

The remaining sandbox connection inputs are external provider values, not missing product logic.

## Provider facts to confirm before sandbox activation

Reconfirm against the current merchant-specific JazzCash integration pack:

- sandbox payment URL;
- sandbox payment-inquiry/status URL;
- sandbox refund/void URL;
- merchant ID, password and integrity salt;
- refund request envelope required by the assigned JazzCash product (`RefundRequest` wrapper or flat body);
- transaction type, version, bank ID and product ID;
- return and asynchronous notification behavior;
- response-code and transaction-status mapping;
- whether status/refund responses carry `pp_SecureHash` and which fields are covered by it;
- source IP, certificate or network restrictions;
- credential rotation and incident contacts;
- settlement and reconciliation file format;
- refund, reversal and dispute procedure.

Official public JazzCash documentation is useful for the generic contract, but the merchant-specific pack is authoritative. Do not copy historical sandbox IP/HTTP endpoints into a staging deployment unless the current JazzCash merchant pack explicitly instructs it. Production endpoints are never inferred from sandbox documentation.

## Environment configuration

Use the deployment secret manager. Never place real values in GitHub, tickets, screenshots, chat or shell history.

```text
FEATURE_PREMIUM_ENABLED=true
FEATURE_JAZZCASH_ENABLED=true
JAZZCASH_MODE=sandbox
JAZZCASH_MERCHANT_ID=<secret>
JAZZCASH_PASSWORD=<secret>
JAZZCASH_INTEGRITY_SALT=<secret>
JAZZCASH_PAYMENT_URL=https://sandbox.jazzcash.com.pk/ApplicationAPI/API/Payment/DoTransaction
JAZZCASH_RETURN_URL=https://<staging-host>/en/account/payment-return
JAZZCASH_STATUS_URL=<approved sandbox HTTPS inquiry URL>
JAZZCASH_REFUND_URL=<approved sandbox HTTPS refund URL>
JAZZCASH_REFUND_ENVELOPE=refund-request
JAZZCASH_CPS_TIMEOUT_SECONDS=15
JAZZCASH_VERSION=1.1
JAZZCASH_TXN_TYPE=MWALLET
JAZZCASH_BANK_ID=
JAZZCASH_PRODUCT_ID=
JAZZCASH_CHECKOUT_MINUTES=15
```

When JazzCash is enabled, the API refuses to start unless checkout, return, status and refund endpoint configuration is complete. Staging and production require HTTPS provider URLs. Production rejects sandbox mode. Sandbox and production must use separate secrets and merchant credentials.

## Payment-operator sandbox controls

Authenticated administrators with `payment.reconcile` capability can queue provider operations through these server routes:

```text
POST /v1/admin/reports/premium/payments/:id/status-inquiries
POST /v1/admin/reports/premium/payments/:id/refunds
```

Both requests require a trusted SkillUp origin and a reason. Refund requests do not accept an amount or currency from the caller; the background job reads those values from the settled SkillUp order. A duplicate active provider job resolves idempotently instead of creating parallel operations.

## Required sandbox scenarios

Record the order ID, merchant reference, provider reference, response code, entitlement state and audit evidence for each case:

1. Monthly success.
2. Yearly success.
3. User cancellation.
4. Provider-declared failure.
5. Pending result followed by payment-operator status inquiry and verified settlement evidence.
6. Automatic stale-pending status inquiry.
7. Checkout expiry.
8. Duplicate browser return.
9. Duplicate asynchronous event.
10. Invalid secure hash.
11. Wrong amount.
12. Wrong currency.
13. Unknown merchant reference.
14. Delayed callback after learner signs out.
15. Provider outage before handoff.
16. Provider outage after handoff / CPS retry.
17. Successful full refund through the payment-operator route.
18. Repeated refund request/event without duplicate entitlement mutation.
19. Reconciliation resolution with status-inquiry evidence.
20. Kill switch while existing payment evidence and entitlements remain intact.

A screenshot is not payment evidence. Use provider reference/status evidence and SkillUp database/audit records.

## Payment-orchestrator MWALLET v1.1 (local / non-production)

SkillUp can proxy a one-time MWALLET charge through JazzCash payment-orchestrator when `PREMIUM_JAZZCASH_V11_CHECKOUT=true` and `DEPLOYMENT_ENVIRONMENT` is not production. The browser never talks to JazzCash; the API posts signed JSON to the m-wallet charge URL and activates entitlement only on verified `pp_ResponseCode=000`.

Local sandbox testing currently requires the merchant-approved return URL:

```text
PREMIUM_JAZZCASH_V11_CHECKOUT=true
DEPLOYMENT_ENVIRONMENT=local
JAZZCASH_V11_URL=https://onlinepayments.jazzcash.com.pk/payment-orchestrator/api/v1/rest/payments/m-wallet
JAZZCASH_V11_INQUIRY_URL=https://onlinepayments.jazzcash.com.pk/payment-orchestrator/api/v2/rest/payments/status/inquiry
JAZZCASH_V11_MERCHANT_ID=<secret>
JAZZCASH_V11_PASSWORD=<secret>
JAZZCASH_V11_INTEGRITY_SALT=<secret>
JAZZCASH_V11_RETURN_URL=https://maidanofficial.com/callback
JAZZCASH_V11_TIMEOUT_MS=30000
JAZZCASH_V11_CHECKOUT_MINUTES=15
```

Notes:

- `pp_ReturnURL` must match a URL JazzCash has enabled for this merchant. Using a SkillUp localhost or unregistered webhook URL can yield provider `999` / insufficient merchant information even when the HMAC is correct.
- Keep `https://maidanofficial.com/callback` for sandbox testing until SkillUp's own HTTPS payment-return URL is registered with JazzCash.
- Before staging/production go-live, replace `JAZZCASH_V11_RETURN_URL` with SkillUp's owned callback and leave V11 disabled in production until that cutover is approved.
- Local smoke: with API running, execute `apps/api/src/cli/local-jazzcash-v11-smoke.ts` (loads session, charge, inquiry, commercial account, capabilities). Direct field dump: `local-jazzcash-v11-dump.ts`.
- Charge settlement uses `Goo…` merchant references and the V11 integrity salt; classic `FEATURE_JAZZCASH_ENABLED` may stay false while V11 checkout is under test.
- Status inquiry against the orchestrator currently returns provider `110` (invalid SecureHash) with this merchant pack. Treat inquiry as blocked until JazzCash confirms the exact inquiry hash field set; successful MWALLET charge + SkillUp entitlement activation do not depend on inquiry.

## Promotion sequence

1. Run migrations and database smokes with both feature flags off.
2. Add current JazzCash sandbox endpoints and credentials directly to the staging secret store.
3. Deploy staging with Premium enabled and `JAZZCASH_MODE=sandbox`.
4. Verify checkout availability appears only in the intended staging environment.
5. Complete every sandbox scenario, including CPS inquiry and refund.
6. Reconcile all test orders against provider records.
7. Confirm no merchant password, integrity salt or secure hash appears in application logs or release artifacts.
8. Obtain product, finance, security and privacy approval.
9. Configure production credentials with JazzCash still disabled.
10. Verify production health and configuration.
11. Enable Premium first; verify read-only pricing and account states.
12. After separate go-live authorization, enable JazzCash for a controlled internal cohort.
13. After separate real-transaction authorization, verify the first low-value production transaction and settlement record.
14. Expand traffic only after reconciliation is clean.

## Kill switch and recovery

Immediate checkout stop:

```text
FEATURE_JAZZCASH_ENABLED=false
JAZZCASH_MODE=disabled
```

This must not remove existing entitlements or payment evidence. Continue provider reconciliation, preserve audit records, rotate compromised credentials and correct access only through an append-only entitlement event.
