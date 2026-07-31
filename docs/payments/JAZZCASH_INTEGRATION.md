# JazzCash Integration and Activation

## Current safety state

The repository is production-built but JazzCash remains fail-closed by default:

```text
FEATURE_PREMIUM_ENABLED=false
FEATURE_JAZZCASH_ENABLED=false
JAZZCASH_MODE=disabled
```

Do not enable payment traffic until the merchant account, URLs, credentials, sandbox scenarios, reconciliation owner and refund process are approved.

## Architecture

1. The authenticated learner selects a versioned plan.
2. SkillUp creates an idempotent server-side `payment_order` using the authoritative plan price.
3. The API creates the provider form and HMAC-SHA256 secure hash.
4. The browser posts the signed form directly to the configured JazzCash payment URL.
5. JazzCash returns to the same-origin SkillUp return handler.
6. The API verifies the secure hash, order reference, PKR currency and exact amount before changing order state.
7. A successful verified order creates exactly one server-authoritative entitlement.
8. Replayed callbacks remain idempotent. Amount, currency and status mismatches open reconciliation cases.
9. Refund evidence updates the entitlement without deleting learning history.

The browser never decides whether premium is active.

## Provider facts to confirm before activation

Reconfirm against the merchant-specific JazzCash integration pack:

- payment URL for sandbox and production;
- merchant ID, password and integrity salt;
- transaction type, version, bank ID and product ID;
- return and asynchronous notification behavior;
- response-code mapping;
- status-query and refund endpoints;
- source IP, certificate or network restrictions;
- credential rotation and incident contacts;
- settlement and reconciliation file format;
- refund, reversal and dispute procedure.

Official sandbox references used during implementation:

- `https://sandbox.jazzcash.com.pk/SandboxDocumentation/index.html`
- `https://payments.jazzcash.com.pk/SandboxDocumentation/features.html`
- `https://payments.jazzcash.com.pk/SandboxDocumentation/Resources.html`

Merchant-specific documentation is authoritative when it differs.

## Environment configuration

Use the deployment secret manager. Never place real values in GitHub, tickets, screenshots, chat or shell history.

```text
FEATURE_PREMIUM_ENABLED=true
FEATURE_JAZZCASH_ENABLED=true
JAZZCASH_MODE=sandbox
JAZZCASH_MERCHANT_ID=<secret>
JAZZCASH_PASSWORD=<secret>
JAZZCASH_INTEGRITY_SALT=<secret>
JAZZCASH_PAYMENT_URL=<approved sandbox HTTPS URL>
JAZZCASH_RETURN_URL=https://<staging-host>/en/account/payment-return
JAZZCASH_VERSION=1.1
JAZZCASH_TXN_TYPE=MWALLET
JAZZCASH_BANK_ID=TBANK
JAZZCASH_PRODUCT_ID=RETL
JAZZCASH_CHECKOUT_MINUTES=15
```

Production rejects sandbox mode. Sandbox and production must use separate projects, secrets and merchant credentials.

## Required sandbox scenarios

Record the order ID, merchant reference, provider reference, response code, entitlement state and audit evidence for each case:

1. Monthly success.
2. Yearly success.
3. User cancellation.
4. Provider-declared failure.
5. Pending result followed by verified success.
6. Checkout expiry.
7. Duplicate browser return.
8. Duplicate asynchronous event.
9. Invalid secure hash.
10. Wrong amount.
11. Wrong currency.
12. Unknown merchant reference.
13. Delayed callback after learner signs out.
14. Provider outage before handoff.
15. Provider outage after handoff.
16. Successful refund.
17. Repeated refund event.
18. Reconciliation resolution with evidence.

A screenshot is not payment evidence. Use provider reference/status evidence and SkillUp database/audit records.

## Promotion sequence

1. Run migrations and database smokes with both feature flags off.
2. Deploy staging with premium enabled and JazzCash sandbox enabled.
3. Verify the pricing page shows checkout availability only in staging.
4. Complete every sandbox scenario.
5. Reconcile all test orders against provider records.
6. Confirm no sensitive JazzCash field appears in application logs or release artifacts.
7. Obtain product, finance, security and privacy approval.
8. Configure production credentials with both feature flags still off.
9. Verify production health and configuration.
10. Enable premium first; verify read-only pricing and account states.
11. Enable JazzCash for a controlled internal cohort.
12. Verify the first real low-value transaction and settlement record.
13. Expand traffic only after reconciliation is clean.

## Kill switch and recovery

Immediate checkout stop:

```text
FEATURE_JAZZCASH_ENABLED=false
JAZZCASH_MODE=disabled
```

This must not remove existing entitlements or payment evidence. Continue provider reconciliation, preserve audit records, rotate compromised credentials and correct access only through an append-only entitlement event.
