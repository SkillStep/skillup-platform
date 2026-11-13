# SkillUp → GrowthOS: verified checkout conversion relay (staging runbook)

**Status:** Draft PR #260. Disabled by default. Do not merge, enable real billing, or claim commercial acceptance until signed payment provider receipts and product pricing approval exist. The relay currently covers **direct JazzCash V11/classic settled orders** in SkillUp's `payment_orders`; the preferred external payment-service wallet flow has a different authority model and needs its own verified-payment adapter before rollout.

## End-to-end event contract

1. GrowthOS publishes a brand-owned page with a verified domain, campaign, active approved package, and optionally a published banner variation. Its approved SkillUp checkout destination receives `growthos_page_id`, `growthos_version_id`, `growthos_campaign_id`, `growthos_package_id`, `growthos_package_code`, `growthos_variation_id`, `growthos_variation_version_id` and `growthos_session_id` only on an approved destination. Never append those identifiers to untrusted third-party links. Other UTM fields remain ordinary marketing attribution.
2. SkillUp captures those bounded identifiers into the checkout attribution and persists the same snapshot with the **authoritatively priced** payment order. The logged-in or pay-first user completes JazzCash verification via the existing payment integration. A browser redirect, click, wallet link, test-only bypass or provisional pending result is **not a conversion**.
3. SkillUp's signed JazzCash settlement must record `payment_orders.status='succeeded'`, an exact PKR amount, a signed/verified `payment_events` success (code `000`), and an active entitlement linked to the same order. Only then may the opt-in worker enqueue the order's ID in `growthos_conversion_outbox`.
4. The outbox worker checks the same verified evidence again before POSTing to GrowthOS `/api/conversions` via HTTPS with a **server-only, brand-scoped** bearer token. The idempotency key is `skillup-<payment_order_uuid>`. The paid conversion value is the **settled order amount in PKR major units**, not the GrowthOS banner/advertisement's price or a browser value.
5. GrowthOS checks brand, campaign, page, published version, variation and package ownership; where a paid package is specified, it checks the confirmed amount/currency against the approved immutable package price. A successful callback creates one canonical conversion; duplicate calls respond accepted/duplicate without changing sales counts.
6. For staging, `testTraffic=true` and `marketingConsent=false`. Terms acceptance alone does not authorize Meta/TikTok server events. The provider delivery switch remains **OFF**. Genuine provider Test Events require separately approved matching signals, provider configuration and consent before they may be tested.

## Isolated staging configuration (never copy secrets into GitHub)

**GrowthOS Web staging Vercel server env:**

- `GROWTHOS_CONVERSION_SECRET_<BRAND_UUID_WITHOUT_HYPHENS_UPPERCASE>` = a unique strong bearer token for the SkillUp brand.
- Existing `CONVERSION_INGEST_SECRET` is legacy only. The configured per-brand key takes precedence.
- `GROWTHOS_PROVIDER_DELIVERY_ENABLED=false`. Do not enable Meta/TikTok sending during checkout acceptance.

**SkillUp staging API server env:**

- `GROWTHOS_CONVERSION_ENABLED=false` until the product/page/version/package UUIDs and ads-approved billing amount are verified.
- `GROWTHOS_CONVERSION_URL=https://<isolated-growthos-web-host>/api/conversions`.
- `GROWTHOS_CONVERSION_SECRET=<same-new-server-only-brand-token>`.
- `GROWTHOS_BRAND_ID=<staging-verified-skillup-brand-uuid>`.
- Production requires `GROWTHOS_PRODUCTION_APPROVED=true` **in addition to** the main enable switch. The default remains disabled.
- `NEXT_PUBLIC_GROWTHOS_CHECKOUT_ENABLED=false` on SkillUp Web until approved campaign price and actual charged subscription terms match. This is not a substitute for the existing payment provider's own enable/disable controls.

**Do not use dummy identifiers** from synthetic CI seed in the real staged deployment. Verify the IDs in the live isolated GrowthOS staging database and verify the selected SkillUp landing route handles the approved provider type. Seeded CI UUIDs, mock test receipts and a successful UI redirect are not a substitute for real provider acceptance.

## Blocking pricing discrepancy

GrowthOS's current **CI/demo** package `1` is PKR 566 (other demo prices include PKR 660). SkillUp's 2026-10 approved active monthly price is **PKR 990** (PKR 99,000 minor units) and the listed yearly price is **PKR 4,999**. Before activating a campaign, obtain explicit pricing/billing/tax approval, create the correct package offer version in GrowthOS and validate it against the SkillUp backend's authoritative price and interval. Until then, both the SkillUp checkout gate and GrowthOS's new package price/currency check must reject a mismatched campaign. Never silently charge PKR 990 after advertising PKR 566.

## Acceptance checklist (all test users synthetic; sandbox only)

| Scenario | Expected evidence |
| --- | --- |
| Unauthenticated/public `POST /api/conversions` | HTTP 401; no conversion |
| Valid paid JazzCash sandbox order | Signed success, matching amount/currency, active entitlement, outbox `pending→delivered`, one canonical GrowthOS conversion |
| Duplicate signed JazzCash callback and duplicate GrowthOS request | Same order/entitlement; same idempotency key; one canonical conversion |
| Failed, cancelled, expired, pending, refunded or test bypass | No successful revenue conversion |
| Wrong product token / cross-brand IDs / wrong page or version | 401 or 400; no attributed revenue |
| Unknown/inactive package, wrong campaign or different charged price/currency | 400 or blocked; no conversion |
| Legitimate purchase lacking marketing consent/matching | Canonical first-party conversion only; no provider delivery |
| 401/403/400 from GrowthOS | Outbox blocked for operator investigation; no infinite retries |
| 429/5xx/timeout/network interruption | Bounded retry and recoverable lease; no duplicate conversion |
| Stage/production toggles off | No worker sending, no change to existing JazzCash business logic |
| Meta/TikTok test (separate gate) | Real Test Events receipt ID, consent, correct source and deduplication, transport disabled after test |

## Operator verification query (SkillUp disposable/staging DB only)

```sql
select q.status, count(*)::int total, min(q.created_at) oldest, max(q.updated_at) latest
from growthos_conversion_outbox q
group by q.status order by q.status;
```

```sql
select q.order_id, q.status, q.attempts, q.last_http_status, q.last_error_code,
       o.status as payment_status, o.amount_minor, o.currency
from growthos_conversion_outbox q
join payment_orders o on o.id=q.order_id
order by q.created_at desc limit 50;
```

Never include full wallet tokens, MPIN, phone numbers, provider matching PII or provider credentials in evidence files or logs.

## Explicit exclusions and release decision

This PR adds the first direct-JazzCash SkillUp product-side callback; it does **not** configure JazzCash merchant sandbox, enable checkout, certify live payments, complete Jalwa or BizB product backend adapters, or prove Meta/TikTok Test Events. The **external payment-service** source in SkillUp (`FEATURE_PAYMENT_SERVICE_ENABLED=true`) requires a separately designed reconciliation adapter using authoritative successful payment-history records and transaction IDs; entitlement status alone cannot be counted as paid revenue. These unresolved dependencies remain release blockers under GrowthOS Issue #53. Keep both GrowthOS PR #49 and SkillUp PR #260 draft until reviewer approval and real signed staging evidence are available.
