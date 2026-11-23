# TikTok Pixel — agent integration guide

**Audience:** Cursor / coding agents implementing TikTok Pixel on SkillUp-like web products.  
**Use this file as the handoff reference** when a client provides a Pixel ID and a campaign landing URL.  
**Product example in this repo:** SkillUp (`/landing2`, Pixel `DBU5QHBC77UCDH70PUAG`).

---

## 0. One-sentence goal

Install the client’s TikTok Pixel so TikTok Ads can measure visits and conversions on the campaign landing and checkout funnel — without making the Pixel the source of truth for paid-subscription reporting.

---

## 1. What the client usually means

When a client sends something like:

```text
https://example.com/landing2?utm=T&package=2&parameter=20percentoff&payment=jazzcash
SkillUp pixel id: DBU5QHBC77UCDH70PUAG
```

They mean:

| Client input | Interpretation |
| --- | --- |
| Landing URL | The page TikTok ads send traffic to |
| `utm=T` (or similar) | TikTok traffic source |
| Pixel ID (alphanumeric, ~15–20+ chars) | **TikTok Pixel ID** (not GA4 `G-…`, not Meta numeric ID) |

### ID format cheat sheet

| Platform | Typical ID shape | Example |
| --- | --- | --- |
| TikTok Pixel | Alphanumeric string | `DBU5QHBC77UCDH70PUAG` |
| Meta Pixel | Mostly numeric | `123456789012345` |
| GA4 | Starts with `G-` | `G-XXXXXXXX` |

If only a TikTok Pixel ID is provided, implement **TikTok only**. Do not invent a Meta Pixel.

---

## 2. Minimum inputs required

### Required

1. **TikTok Pixel ID**
2. **Campaign landing URL** (path + UTM / offer query params)

### Strongly preferred (ask if missing)

3. Which **events** TikTok Ads Manager expects  
   Default if unspecified: `PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`, `CompletePayment` / `Subscribe`
4. Whether Pixel should load **site-wide** or only on the landing  
   Default: **site-wide base code** (needed because payment return often lands on `/` or `/account`, not the landing)
5. Staging / Events Manager access for Test Events verification

### Optional / later

6. TikTok **Events API** access token (server-side)  
7. Meta Pixel ID (separate request)

**Do not block** browser Pixel implementation waiting for Events API or Meta.

---

## 3. Architecture rules (non-negotiable)

1. **Marketing only.** Pixel / GA4 must never be the official source of truth for paid subscriptions, revenue, or entitlement. Prefer payment webhooks + DB attribution.
2. **Never throw.** Analytics failures must not break checkout, payment return, or auth.
3. **Dedupe conversions** by stable `transaction_id` / order id (session or durable store). Fire purchase/subscribe **once** per order.
4. **Same moment as existing analytics.** If the product already has GA4 landing events, fire TikTok at those same call sites — do not invent a second funnel.
5. **Runtime-configurable ID.** Prefer server/runtime env (`TIKTOK_PIXEL_ID`) exposed via a `<meta>` tag so container deploys can change the ID without rebuilding. Allow `NEXT_PUBLIC_TIKTOK_PIXEL_ID` as build-time fallback.
6. **Pixel IDs are not secrets.** They appear in client HTML/JS. Still do not paste Events API tokens into the repo or chat.
7. **Update CSP.** Production CSP must allow TikTok script/connect/image hosts or the Pixel will silently fail.

---

## 4. Recommended file layout (Next.js / similar)

Mirror this pattern in other products:

```text
apps/web/lib/tiktok-pixel.ts              # load SDK + logTikTokEvent()
apps/web/lib/tiktok-pixel.test.ts         # unit tests (mock window/document)
apps/web/app/tiktok-runtime-config.tsx    # <meta name="…-tiktok-pixel-id">
apps/web/app/layout.tsx                   # include runtime config in <head>
apps/web/lib/landing-analytics.ts         # call TikTok beside GA4 / funnel helpers
apps/web/next.config.ts                   # CSP allowlist
docs/product/TIKTOK_PIXEL_INTEGRATION.md  # product-specific record (URL, ID, events)
```

This guide (`TIKTOK_PIXEL_AGENT_GUIDE.md`) is the **reusable playbook**.  
The product-specific MD records the **exact client URL, Pixel ID, and verification notes**.

---

## 5. Implementation checklist

Copy this checklist into the PR / issue:

- [ ] Confirm landing URL is the TikTok / promo landing (`utm=T` or product equivalent)
- [ ] Confirm ID is TikTok (not GA4 / Meta)
- [ ] Add runtime meta + env resolution for Pixel ID
- [ ] Add browser loader (`analytics.tiktok.com/i18n/pixel/events.js`)
- [ ] Wire events at landing view, CTA, and payment success
- [ ] Dedupe paid conversion by order / transaction id
- [ ] Extend CSP (`script-src`, `connect-src`, `img-src`)
- [ ] Add unit tests with mocked `window` / `document`
- [ ] Write product-specific MD with client URL + Pixel ID + event map
- [ ] Document staging env var for operators
- [ ] Verify with TikTok Pixel Helper / Events Manager Test Events
- [ ] Explicitly state: Pixel ≠ official Subs report

---

## 6. Standard event map

Use this default mapping unless the client specifies different TikTok event names:

| Product moment | TikTok event | Notes |
| --- | --- | --- |
| Landing / offer page open | `PageView` | Via `ttq.page()` |
| Landing / offer page open | `ViewContent` | Include content_id, value, currency when known |
| Primary CTA (Subscribe / Buy) | `AddToCart` | Before redirect to wallet / checkout |
| Primary CTA | `InitiateCheckout` | Same click is fine |
| Payment success — one-time / yearly style | `CompletePayment` | Pass `event_id` = order id |
| Payment success — subscription / monthly style | `Subscribe` | Pass `event_id` = order id |
| Payment failed / pending | Do **not** fire CompletePayment / Subscribe | Optional custom or skip |

### Payload shape (browser)

```ts
ttq.track("CompletePayment", {
  contents: [
    {
      content_id: "premium-yearly",
      content_type: "product",
      content_name: "Premium Yearly (20% off)",
    },
  ],
  content_type: "product",
  value: 3999,
  currency: "PKR",
}, { event_id: orderId });
```

Include campaign dimensions when available (`traffic_source`, `utm_code`, `banner_parameter`, `landing`) as extra params — useful for debugging, not a substitute for server attribution.

---

## 7. CSP allowlist (minimum)

Add hosts as required by your CSP builder:

```text
script-src:  https://analytics.tiktok.com
connect-src: https://analytics.tiktok.com https://analytics-ipv6.tiktok.com https://business-api.tiktok.com
img-src:     https://analytics.tiktok.com
```

If GA4 is also used, allow Google Tag / Analytics hosts the same way. A Pixel that “is integrated” but blocked by CSP will not appear in TikTok Events Manager.

---

## 8. Environment variables

```dotenv
# Preferred — runtime, works with standalone / container images
TIKTOK_PIXEL_ID=DBU5QHBC77UCDH70PUAG

# Optional — build-time fallback for local / static embeds
NEXT_PUBLIC_TIKTOK_PIXEL_ID=DBU5QHBC77UCDH70PUAG
```

Resolution order agents should implement:

1. Runtime meta / `TIKTOK_PIXEL_ID`
2. `NEXT_PUBLIC_TIKTOK_PIXEL_ID`
3. Optional documented product default (only if the client explicitly supplied that product’s Pixel ID)

---

## 9. Verification steps (agents + humans)

1. Open the exact campaign landing URL the client provided.
2. Confirm `<meta name="…-tiktok-pixel-id" content="…">` is present.
3. Network tab: request to `analytics.tiktok.com` succeeds (not CSP-blocked).
4. TikTok Pixel Helper: Pixel ID matches; `PageView` / `ViewContent` on load.
5. Click CTA: `AddToCart` + `InitiateCheckout`.
6. Complete a **staging** payment success with an order id: one `CompletePayment` or `Subscribe`.
7. Reload / repeat success with same order id: **no second** conversion event.
8. Cross-check product admin / DB attribution for the same order — Pixel count is secondary.

---

## 10. What not to do

- Do not treat Pixel totals as official subscription or revenue numbers.
- Do not commit Events API secrets or TikTok access tokens to git.
- Do not put real answer keys, PII, or payment credentials in Pixel payloads.
- Do not fire `CompletePayment` on “button click” — only after confirmed payment success.
- Do not merge Pixel work with unrelated production promotion / billing flag changes.
- Do not assume Meta Pixel is required because TikTok was requested.
- Do not hard-block the product if Pixel ID env is missing when a documented client default exists — but do no-op safely if no valid ID is available.

---

## 11. Suggested PR summary template

```md
## Summary
- Integrate TikTok Pixel `<PIXEL_ID>` for campaign landing `<PATH>`.
- Fire PageView/ViewContent, AddToCart/InitiateCheckout, and CompletePayment|Subscribe (deduped by order id).
- CSP + runtime env `TIKTOK_PIXEL_ID` + product MD guide.

## Test plan
- [ ] Pixel Helper on landing URL
- [ ] CTA events
- [ ] Staging payment success → one conversion event
- [ ] Unit tests for loader + landing analytics
```

---

## 12. SkillUp concrete reference (this repository)

| Item | Value |
| --- | --- |
| Landing | `/landing2?utm=T&package=2&parameter=20percentoff&payment=jazzcash` |
| Pixel ID | `DBU5QHBC77UCDH70PUAG` |
| Loader | `apps/web/lib/tiktok-pixel.ts` |
| Runtime meta | `apps/web/app/tiktok-runtime-config.tsx` |
| Funnel wiring | `apps/web/lib/landing-analytics.ts` |
| Product record | `docs/product/TIKTOK_PIXEL_INTEGRATION.md` |

When starting a **new** product, copy this guide, replace the SkillUp section with that product’s URL/ID, and follow sections 2–9.

---

## 13. Agent prompt snippet (paste into other repos)

```text
Follow docs/product/TIKTOK_PIXEL_AGENT_GUIDE.md.

Client provided:
- Landing URL: <URL>
- TikTok Pixel ID: <PIXEL_ID>

Implement browser TikTok Pixel with runtime env, CSP allowlist, and event wiring at landing view / CTA / payment success (dedupe by order id). Write a short product-specific MD recording the URL, Pixel ID, and event map. Do not treat Pixel as source of truth for paid subs. Do not implement Meta Pixel unless a Meta Pixel ID is provided.
```
