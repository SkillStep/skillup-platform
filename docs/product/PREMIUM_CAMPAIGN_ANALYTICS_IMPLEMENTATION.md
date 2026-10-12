# Premium campaign analytics implementation

**Branch:** `feat/premium-campaign-attribution-phase1`  
**Scope:** Work done after the GA4 landing spec and Maidan A–Z handoff were provided  
**Audience:** Engineering, QA, PM, Marketing  

This document summarizes what was implemented in this monorepo for UTM campaign attribution, admin Subs reporting, GA4 marketing events, funnel ops events, and report hygiene.

---

## 1. Sources of truth (do not mix)

| Layer | Role | Official Subs count? |
| --- | --- | --- |
| **GA4 (gtag / Firebase Measurement ID)** | Marketing / ads optimization in Google Analytics | **No** |
| **Backend funnel events** (`commercial_events`) | Ops funnel (paywall → cart → subscribe/purchase) | **No** |
| **Succeeded `payment_orders` + stored attribution** | Daily / Basic / Detailed campaign Subs report | **Yes** |

**Rule:** Never use GA4 (or Meta/TikTok pixels) as the source of truth for paid subscription reports. Use completed payments with stored attribution dimensions.

Timezone for report day buckets: **Asia/Karachi**.

---

## 2. What already existed vs what we built

### Already in the repo
- Landing URL contract helpers (`apps/web/lib/landing-campaign.ts`)
- Campaign landings: `/mainLanding`, `/landing2` (20% off yearly)
- JazzCash wallet-link checkout (`link/start`, `link/complete`)
- Admin: `/en/admin`, `/en/admin/premium` (Summary, Payments, Memberships, etc.)
- Premium finance reports APIs under `/v1/admin/reports/premium/*`
- `commercial_events` table (append-only ops events)

### Built in this work (Phases 1–5)
- Client attribution capture (30-day `localStorage`) + send on billing APIs
- Backend sanitize + store attribution on user / wallet-link intent / payment order
- Campaign attribution aggregator + admin API + **Campaign attribution** tab
- GA4 via gtag (Measurement ID from Firebase project)
- Allowlisted client funnel POST + server `subscribe`/`purchase` commercial events with attribution
- Omit/restore hygiene for campaign report + landing URL doc for ads

### Not built (optional / blocked)
- Meta Pixel / TikTok Pixel (need Pixel IDs; only required for in-platform ad optimization)
- Marketing “landing portal” (banner CMS / publish without deploy) from the frontend GA4 portal spec
- Firebase npm SDK (blocked by repo supply-chain build-script policy; gtag used instead)

---

## 3. Landing URL contract

| Param | Report dimension | Examples |
| --- | --- | --- |
| `utm` | Platform | `D`, `T` (TikTok), `M` (Meta) |
| `package` | Package | `default` / `1` = monthly, `2` = yearly |
| `parameter` | Campaign / offer / partner | `default`, `20percentoff` |
| `payment` | Payment rail (stored, not a Subs column) | `jazzcash` |

Also stored when present: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `ref`, `landing`, `landingPath`.

**Rule:** If `utm` is set and `utm_source` is empty → copy `utm` → `utm_source`.

### Example URLs (staging host may vary)

```
/mainLanding?utm=D&package=default&parameter=default&payment=jazzcash
/mainLanding?utm=D&package=2&parameter=default&payment=jazzcash
/landing2?utm=T&package=2&parameter=20percentoff&payment=jazzcash
/mainLanding?utm=M&package=default&parameter=Ranchers&payment=jazzcash
```

More detail: [`PREMIUM_CAMPAIGN_LANDING_URLS.md`](./PREMIUM_CAMPAIGN_LANDING_URLS.md).

---

## 4. Phase 1 — Attribution spine

### Frontend
| File | Purpose |
| --- | --- |
| `apps/web/lib/utm-attribution.ts` | Capture / read last-touch attribution (30-day TTL, key `skillup_utm_attribution`) |
| `apps/web/app/mainLanding/landing-subscribe.tsx` | Sends `attribution` on JazzCash `link/start` and staging bypass |
| `apps/web/app/landing2/page.tsx` | Stamps `landing: "landing2"` |

Body shape sent to billing:

```json
{
  "attribution": {
    "utm": "T",
    "utm_source": "T",
    "package": "2",
    "parameter": "20percentoff",
    "payment": "jazzcash",
    "landing": "landing2",
    "landingPath": "/landing2?utm=T&package=2&parameter=20percentoff&payment=jazzcash"
  }
}
```

### Backend
| File | Purpose |
| --- | --- |
| `apps/api/src/premium-attribution.ts` | Allowlist sanitize + clip (80 chars; `landingPath` 120) |
| `packages/database/drizzle/0029_premium_campaign_attribution.sql` | Columns + index |
| `apps/api/src/jazzcash-v11-billing.ts` | Persist on wallet-link intent + user; copy to `payment_orders` on charge |
| `apps/api/src/commercial.ts` | Bypass path stores attribution on user / commercial event |

### DB columns (migration `0029`)
- `users.premium_attribution` (jsonb) — last-touch
- `jazzcash_wallet_link_intents.attribution` (jsonb)
- `payment_orders.attribution` (jsonb) — **Subs report source**

Ops flag (payment attribution only):

```json
{ "omitFromCampaignReport": true }
```

---

## 5. Phase 2 — Campaign Subs report (admin)

### API
- `GET /v1/admin/reports/premium/campaign-attribution`  
  Capability: `premium.report.read`

**Views in response:**
- `totals` — subscriptions + amount
- `basic` — date × platform × package × parameter
- `detailed.platformByParameter` / `detailed.packageByParameter`
- `daily` — per-day maps
- `exportRows` — flat CSV-ready rows

**Filter:** `payment_orders.status = 'succeeded'`, `completed_at` in range, skip omitted rows.

### Export
- Report type `campaign_attribution` on existing premium export flow  
  Capability: `premium.report.export`

### Admin UI
- Existing page: `/en/admin/premium`
- **New tab:** Campaign attribution (tables for Basic / Detailed / Daily)

### Key files
| File | Purpose |
| --- | --- |
| `apps/api/src/premium-campaign-attribution-report.ts` | Aggregator |
| `apps/api/src/premium-reporting-queries.ts` | `campaignAttribution` query |
| `apps/api/src/premium-reporting-routes.ts` | Route wiring |
| `apps/web/app/[locale]/admin/premium/premium-workspace.tsx` | UI tab |

Schema version string: `premium-campaign-attribution.v1`.

---

## 6. Phase 3 — GA4 marketing (gtag)

Firebase web config was provided (`measurementId: G-GF9V7B4HSL`). The Firebase **npm SDK** could not be installed under this repo’s supply-chain build-script policy. Tracking uses **gtag → same GA4 property**.

### Env
```
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-GF9V7B4HSL
```
(Set on web runtime for staging/production. Local: `apps/web/.env.local` — untracked.)

Optional Firebase metadata keys are documented in `.env.example` for future use; runtime tracking only requires the Measurement ID.

### Events (marketing only)

| When | Events |
| --- | --- |
| Landing load | `landing_view`, `view_item` |
| Subscribe Now (before JazzCash) | `add_to_cart`, `begin_checkout` |
| Home return `?payment=…&orderId=…` | `payment_result`; on success also `subscribe` (monthly) or `purchase` (yearly), deduped by `orderId` |

Package mapping (hardcoded until a portal exists):

| Package | Token-time GA4 event | Value (PKR) |
| --- | --- | --- |
| monthly (`default` / `1`) | `subscribe` | 599 |
| yearly (`2`) | `purchase` | 4999 (3999 if `parameter=20percentoff`) |

UTM → `traffic_source`: `M`→`meta`, `T`→`tiktok`, else `direct`. Context kept in `sessionStorage` key `lp_context`; sent-token dedupe key `lp_sent_tokens`.

### Key files
| File | Purpose |
| --- | --- |
| `apps/web/lib/ga4.ts` | gtag loader + `logGa4Event` |
| `apps/web/lib/landing-analytics.ts` | Landing event helpers |
| `apps/web/app/mainLanding/landing-analytics-boot.tsx` | Fire view events on landings |
| `apps/web/app/[locale]/home-payment-banner.tsx` | Token-time conversion on payment return |

---

## 7. Phase 4 — Backend funnel events (ops)

### Client-allowed ingest
- `POST /v1/premium/analytics/events`  
- Alias: `POST /v1/premium/events`  

Allowlist: `paywall_viewed`, `plan_selected`, `add_to_cart`  
Auth: optional (pay-first landings). PII-like metadata keys stripped.

Landings POST:
- `paywall_viewed` on load  
- `plan_selected` + `add_to_cart` on Subscribe Now  

### Server on JazzCash payment success
When entitlement is newly activated from a verified payment, `commercial_events` also records (with attribution in `properties`):
- existing: `payment_succeeded`, `entitlement_activated`
- added: `subscribe`, `purchase`

These are **ops funnel** signals. Campaign Subs still come only from succeeded payments.

### Migration
- `packages/database/drizzle/0030_premium_funnel_events.sql` — extends `commercial_events` name allowlist

### Key files
| File | Purpose |
| --- | --- |
| `apps/api/src/premium-funnel-events.ts` | Sanitize + routes |
| `apps/web/lib/premium-funnel.ts` | Client POST helper |
| `apps/api/src/commercial.ts` | Commerce events with attribution on callback |

---

## 8. Phase 5 — Hygiene + landing URL doc

### Prefer omit over delete
Succeeded payments can be hidden from the campaign grid without deleting billing history:

```
POST /v1/admin/reports/premium/campaign-attribution/hygiene
```
Capability: `premium.report.export`

Body examples:

```json
{
  "action": "omit",
  "reason": "Staging QA — hide default direct traffic from Daily",
  "match": {
    "preset": "last_7_days",
    "platform": "D",
    "parameter": "default"
  }
}
```

```json
{
  "action": "restore",
  "reason": "Restore partner rows",
  "orderIds": ["<payment-order-uuid>"]
}
```

List recent succeeded payments (with omitted flag):

```
GET /v1/admin/reports/premium/campaign-attribution/orders?preset=last_30_days&omitted=all&limit=50
```

### Admin UI
On **Campaign attribution** tab:
- Hygiene form (omit/restore by order IDs and/or platform/package/parameter + selected date range)
- Table of recent succeeded payments in range

### Docs
- This file  
- [`PREMIUM_CAMPAIGN_LANDING_URLS.md`](./PREMIUM_CAMPAIGN_LANDING_URLS.md)

### Key files
| File | Purpose |
| --- | --- |
| `apps/api/src/premium-campaign-hygiene.ts` | Omit/restore + list orders |
| `apps/web/app/[locale]/admin/premium/premium-workspace.tsx` | Hygiene UI |

---

## 9. Admin panel — clarified

The SkillUp admin was **not** created from scratch for this work.

| Surface | Status |
| --- | --- |
| `/en/admin` | Pre-existing ops/governance |
| `/en/admin/premium` | Pre-existing Premium finance/reporting workspace |
| **Campaign attribution** tab + hygiene | **Added** in Phases 2 & 5 |

There is still **no** separate Marketing “landing CMS portal” (upload banner / publish parameter without a deploy). Campaign pages remain coded landings (`mainLanding`, `landing2`).

---

## 10. Acceptance checklist (minimal)

1. Open  
   `/landing2?utm=T&package=2&parameter=20percentoff&payment=jazzcash`
2. Confirm `localStorage` has `skillup_utm_attribution` (and GA4 DebugView shows `landing_view` if Measurement ID is set).
3. Complete a staging paid subscription.
4. In DB, `payment_orders` row is `succeeded` with matching `attribution`.
5. Admin → Premium → Campaign attribution for today shows **+1** under platform `T`, package `2`, parameter `20percentoff`.
6. Optional: omit that row via hygiene → grid count drops; payment row remains; restore brings it back.
7. Optional: GA4 shows `purchase` once for that `orderId` — **do not** treat as official Subs.

---

## 11. Env / deploy notes

| Env | Where | Required for |
| --- | --- | --- |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Web runtime | GA4 events |
| DB migrations `0029`, `0030` | API / database deploy | Attribution columns + funnel event names |
| JazzCash V11 checkout flags (existing) | API | Real payment path that stamps attribution |

Meta / TikTok Pixel IDs: **not required** for official Subs or SkillUp admin reports. Add later only if those ad platforms need in-platform conversion optimization.

---

## 12. Related input docs (reference)

| Doc | Role |
| --- | --- |
| `resources/GA4/GA4_Landing_Page_Implementation_Specification.md` | Frontend GA4 / landing portal inspiration |
| Maidan A–Z handoff (shared in chat) | Backend attribution + Subs report pattern |

---

**End of implementation summary.**  
Phases 1–5 complete on branch `feat/premium-campaign-attribution-phase1`. Remaining optional: Meta/TikTok pixels when Pixel IDs are provided.
