# Premium campaign landing URLs

Use these URL shapes for ads, partner placements, and QA. Attribution is captured on landing and stored on the payment when JazzCash checkout completes.

**Official Subs / Daily campaign report** uses succeeded `payment_orders` with stored attribution — not GA4.

## Query contract

| Param | Meaning | Examples |
| --- | --- | --- |
| `utm` | Platform / traffic source | `D` (direct/default), `T` (TikTok), `M` (Meta) |
| `package` | Plan price point | `default` / `1` = monthly, `2` = yearly |
| `parameter` | Campaign / offer / partner | `default`, `20percentoff`, partner codes |
| `payment` | Payment rail | `jazzcash` |

If `utm` is set and `utm_source` is empty, the backend copies `utm` → `utm_source`.

## Staging examples

Base (replace host if needed): `https://skillupshop.codistan.org`

### Default monthly (main landing)

```
/mainLanding?utm=D&package=default&parameter=default&payment=jazzcash
```

### Yearly Select Plan from pricing-style link

```
/mainLanding?utm=D&package=2&parameter=default&payment=jazzcash
```

### TikTok 20% off yearly

```
/landing2?utm=T&package=2&parameter=20percentoff&payment=jazzcash
```

### Meta monthly example

```
/mainLanding?utm=M&package=default&parameter=Ranchers&payment=jazzcash
```

Legacy `/landing` redirects to `/mainLanding` with the same query string.

## Report dimensions

| Report column | Source field |
| --- | --- |
| Platform | `attribution.utm` or `attribution.utm_source` |
| Package | `attribution.package` |
| Parameter | `attribution.parameter` |

Timezone for day buckets: **Asia/Karachi**.

## Cleaning test traffic (prefer omit, never delete)

Admins with `premium.report.export` can hide succeeded payments from the campaign grid without deleting billing history:

- Admin UI → Premium → **Campaign attribution** → Hygiene panel  
- API: `POST /v1/admin/reports/premium/campaign-attribution/hygiene`

```json
{
  "action": "omit",
  "reason": "Staging QA traffic — hide from Daily campaign report",
  "match": {
    "preset": "last_7_days",
    "platform": "D",
    "parameter": "default"
  }
}
```

Restore with `"action": "restore"` and the same match or `orderIds`.

Flag stored on the payment: `attribution.omitFromCampaignReport = true`.

## Marketing vs finance

| Signal | Counts in campaign Subs report? |
| --- | --- |
| GA4 `landing_view` / `add_to_cart` | No |
| Funnel `paywall_viewed` / `plan_selected` | No |
| JazzCash OTP opened but unpaid | No |
| `payment_orders.status = succeeded` (not omitted) | **Yes** |
