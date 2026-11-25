# TikTok Pixel — agent integration guide

**Audience:** Cursor / coding agents implementing TikTok Pixel on SkillUp-like web products.  
**Use this file as the handoff reference** when a client provides a Pixel ID and a campaign landing URL.  
**Product example in this repo:** Jalwa (`/landing1`, Pixel `DBU5R83C77UCDH70PUCG`).

---

## 0. One-sentence goal

Install the client’s TikTok Pixel so TikTok Ads can measure visits and conversions on the campaign landing and checkout funnel — without making the Pixel the source of truth for paid-subscription reporting.

---

## 1. What the client usually means

When a client sends something like:

```text
https://watch-jalwa.com/landing1?utm=T&package=1&parameter=monthly10k&payment=jazzcash
Jalwa pixel id: DBU5R83C77UCDH70PUCG
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
| TikTok Pixel | Alphanumeric string | `DBU5R83C77UCDH70PUCG` |
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
   **Jalwa client approved set (use this when following this repo):**
   - `PageView` — landing open
   - `ViewContent` — landing open
   - `InitiateCheckout` — Subscribe button click
   - `AddPaymentInfo` — payment details submitted (JazzCash number + Subscribe)
   - `Subscribe` — successful subscription / payment success  
   Do **not** fire `AddToCart` or `CompletePayment` unless a different client explicitly requests them.
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
3. **Dedupe conversions** by stable `transaction_id` / order id (session or durable store). Fire `Subscribe` **once** per order.
4. **Same moments as existing analytics.** If the product already has GA4 landing events, fire TikTok at those same call sites — do not invent a second funnel. Event *names* may differ (GA4 can still use `add_to_cart` / `purchase` while TikTok uses the client-approved set).
5. **Runtime-configurable ID.** Prefer server/runtime env (`TIKTOK_PIXEL_ID`) exposed via a `<meta>` tag so container deploys can change the ID without rebuilding. Allow `NEXT_PUBLIC_TIKTOK_PIXEL_ID` as build-time fallback.
6. **Pixel IDs are not secrets.** They appear in client HTML/JS. Still do not paste Events API tokens into the repo or chat.
7. **Update CSP.** Production CSP must allow TikTok script/connect/image hosts or the Pixel will silently fail.
8. **Do not fire `Subscribe` on wallet-link alone.** JazzCash PIN/MPIN success ≠ paid subscription grant. Only fire after a server-confirmed subscription / charge id.
9. **Assume JazzCash return is cross-site.** Provider POSTs into `/callback`. `SameSite=Lax` cookies set on that response are often dropped. If `Subscribe` depends on a httpOnly receipt cookie alone, it will silently never fire.

---

## 3A. Incident — why Jalwa `Subscribe` was missing (Nov 2026)

**Symptom:** TikTok Events Manager listed `ViewContent`, `InitiateCheckout`, `AddPaymentInfo` as Active, but **no `Subscribe`**, after JazzCash journeys on:

`https://watch-jalwa.com/landing1?utm=T&package=1&parameter=monthly10k&payment=jazzcash`

Upper-funnel beacons worked; this was **not** a wrong Pixel ID / CSP / CTA wiring failure.

### Root causes

1. **Wallet-link ≠ conversion** — `Subscribe` requires granted `subscriptionId` on return (`order=`). Linking alone must not fire it.
2. **Receipt cookie dropped on cross-site JazzCash POST** — client required verified conversion receipt; Lax cookie from `/callback` often never stuck → verify failed → no `ttq.track('Subscribe')`.
3. **Events Manager lag** — Overview can lag ~**30 minutes**; use Test Events / Pixel Helper / network for immediate proof.

### Fix on Jalwa (live on `watch-jalwa.com` when health SHA includes it)

| Piece | Behaviour |
| --- | --- |
| `apps/web/app/callback/route.ts` | Sets `order=<subscriptionId>` only when granted; adds `cv=<signed receipt>`; receipt cookie `SameSite=None; Secure` on HTTPS |
| `apps/web/app/api/campaign/conversion-receipt/route.ts` | Accepts body `receipt` (`cv`) or cookie |
| `apps/web/components/post-jazzcash-auth-prompt.tsx` | POSTs `{ orderId, receipt }`, then `trackLandingPaymentSuccess` |
| `apps/web/lib/landing-analytics.mjs` | `Subscribe` with `event_id = orderId` |

**Agents on SkillUp / sibling products:** copy the diagnostic checklist in `resources/TIKTOK_PIXEL_AGENT_GUIDE.md` §3A and apply the same receipt/`cv` pattern if Subscribe is missing while CTA events are Active.

### SkillUp applied fix (this repo)

| Piece | Behaviour |
| --- | --- |
| `apps/web/app/[locale]/account/payment-return/route.ts` | Granted success → `orderId=` + `cv=` + receipt cookie `SameSite=None; Secure` |
| `apps/web/app/callback/route.ts` | Same `cv` + cookie (compat path) |
| `apps/web/app/api/campaign/conversion-receipt/route.ts` | Verifies body `receipt` (`cv`) or cookie |
| `apps/web/app/[locale]/home-payment-banner.tsx` | Verifies receipt, then `trackPaymentConversion` |
| `apps/web/lib/conversion-receipt.ts` | HMAC sign/verify |
| `apps/web/lib/landing-analytics.ts` | Dual-write `lp_context` (session + localStorage); rebuild from UTM; `Subscribe` `event_id = orderId` |

Product-facing copy: `docs/product/TIKTOK_PIXEL_AGENT_GUIDE.md` §3A.

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
- [ ] Wire **only** client-approved events (Jalwa: PageView, ViewContent, InitiateCheckout, AddPaymentInfo, Subscribe)
- [ ] Dedupe paid conversion (`Subscribe`) by order / transaction id
- [ ] Gate `Subscribe` on **granted subscription / charge id**, not wallet-link alone
- [ ] Make conversion receipt survive JazzCash **cross-site POST** (`?cv=` and/or `SameSite=None; Secure`)
- [ ] Extend CSP (`script-src`, `connect-src`, `img-src`)
- [ ] Add unit tests with mocked `window` / `document`
- [ ] Write product-specific MD with client URL + Pixel ID + event map
- [ ] Document staging env var for operators
- [ ] Verify with TikTok Pixel Helper / Events Manager Test Events (**and** success-return `Subscribe` beacon)
- [ ] Explicitly state: Pixel ≠ official Subs report
- [ ] If `Subscribe` missing while CTA events Active → run §3A / `resources/TIKTOK_PIXEL_AGENT_GUIDE.md` §3A

---

## 6. Standard event map (Jalwa / client-approved)

**Only these five TikTok events** unless a different client document says otherwise:

| Product moment | TikTok event | Notes |
| --- | --- | --- |
| Landing / offer page open | `PageView` | Via `ttq.page()` |
| Landing / offer page open | `ViewContent` | Include content_id, value, currency when known |
| Subscribe button click | `InitiateCheckout` | Before redirect to wallet / checkout |
| Payment info submitted (JazzCash MSISDN + Subscribe) | `AddPaymentInfo` | Same submit as InitiateCheckout is OK |
| Payment / subscription success | `Subscribe` | Pass `event_id` = **granted subscriptionId**; fire once; only after verified receipt |
| Wallet link / PIN success without subscription grant | *(none)* | Do not treat as Subscribe |
| Payment failed / pending | *(none)* | Do not fire Subscribe |

### Removed / do not fire (unless newly requested)

- `AddToCart`
- `CompletePayment`

### Payload shape (browser)

```ts
ttq.track("Subscribe", {
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
TIKTOK_PIXEL_ID=DBU5R83C77UCDH70PUCG

# Optional — build-time fallback for local / static embeds
NEXT_PUBLIC_TIKTOK_PIXEL_ID=DBU5R83C77UCDH70PUCG
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
4. Landing open: `PageView` + `ViewContent`.
5. Click Subscribe (with payment number): **only** `InitiateCheckout` + `AddPaymentInfo` (no `AddToCart`).
6. Complete a **staging** payment success that grants `subscriptionId`: return must include `order=` + `cv=` (receipt). Confirm **one** `Subscribe` beacon (no `CompletePayment`).
7. Reload / repeat success with same order id: **no second** `Subscribe`.
8. If Overview still empty: Test Events; allow up to ~30 minutes.
9. Cross-check product admin / DB attribution for the same order — Pixel count is secondary.
10. If CTA events exist and `Subscribe` does not: diagnose with §3A before changing Pixel ID / CSP.

---

## 10. What not to do

- Do not treat Pixel totals as official subscription or revenue numbers.
- Do not commit Events API secrets or TikTok access tokens to git.
- Do not put real answer keys, PII, or payment credentials in Pixel payloads.
- Do not fire `Subscribe` on “button click” or wallet-link alone — only after confirmed payment / subscription grant.
- Do not rely only on a `SameSite=Lax` cookie set during JazzCash’s cross-site return to authorize `Subscribe`.
- Do not fire `AddToCart` or `CompletePayment` when the client approved the five-event set above.
- Do not merge Pixel work with unrelated production promotion / billing flag changes.
- Do not assume Meta Pixel is required because TikTok was requested.
- Do not hard-block the product if Pixel ID env is missing when a documented client default exists — but do no-op safely if no valid ID is available.

---

## 11. Suggested PR summary template

```md
## Summary
- Integrate TikTok Pixel `<PIXEL_ID>` for campaign landing `<PATH>`.
- Fire **only** PageView, ViewContent, InitiateCheckout, AddPaymentInfo, and Subscribe (deduped by order id).
- CSP + runtime env `TIKTOK_PIXEL_ID` + product MD guide.

## Test plan
- [ ] Pixel Helper on landing URL → PageView + ViewContent
- [ ] CTA → InitiateCheckout + AddPaymentInfo only
- [ ] Staging payment success → one Subscribe
- [ ] Unit tests for loader + landing analytics
```

---

## 12. Jalwa concrete reference (this repository)

| Item | Value |
| --- | --- |
| Landing | `/landing1?utm=T&package=1&parameter=monthly10k&payment=jazzcash` |
| Pixel ID | `DBU5R83C77UCDH70PUCG` |
| Approved events | `PageView`, `ViewContent`, `InitiateCheckout`, `AddPaymentInfo`, `Subscribe` only |
| Loader | `apps/web/lib/tiktok-pixel.mjs` |
| Runtime meta | `apps/web/app/tiktok-runtime-config.tsx` |
| Funnel wiring | `apps/web/lib/landing-analytics.mjs` |
| Product record | `docs/product/TIKTOK_PIXEL_INTEGRATION.md` |
| Portable playbook + §3A checklist | `resources/TIKTOK_PIXEL_AGENT_GUIDE.md` |

When starting a **new** product, copy `resources/TIKTOK_PIXEL_AGENT_GUIDE.md`, replace the concrete reference section with that product’s URL/ID/events, and follow sections 2–9 **including §3A**.

---

## 13. Agent prompt snippet (paste into other repos)

```text
Follow resources/TIKTOK_PIXEL_AGENT_GUIDE.md (and this repo’s TIKTOK_PIXEL_AGENT_GUIDE.md).

Client provided:
- Landing URL: <URL>
- TikTok Pixel ID: <PIXEL_ID>
- Events only: PageView, ViewContent, InitiateCheckout (Subscribe button), AddPaymentInfo, Subscribe (payment success)

Implement browser TikTok Pixel with runtime env, CSP allowlist, and those five events only (dedupe Subscribe by order id). Do not fire AddToCart or CompletePayment. Gate Subscribe on granted subscription id + a receipt that survives JazzCash cross-site POST (section 3A). Write/update the product MD. Do not treat Pixel as source of truth for paid subs. Do not implement Meta Pixel unless a Meta Pixel ID is provided.

If Subscribe is missing while InitiateCheckout/AddPaymentInfo are Active, diagnose with section 3A before changing Pixel ID.
```
