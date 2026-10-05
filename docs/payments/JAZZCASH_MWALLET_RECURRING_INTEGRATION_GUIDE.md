# JazzCash MWallet Recurring Payments — Developer Integration Guide

**Source document:** *MWallet Recurring Payments (Linking & Payment) — VERSION: 2026*  
**Audience:** Frontend and backend developers integrating JazzCash wallet-link + token payments into any merchant app  
**Scope:** Payment-orchestrator APIs for wallet linking, pay-via-token, token lifecycle, and status inquiry  

**Read order:** Sections 1–4 (shared) → **Section 6 Backend** → **Section 7 Frontend** → Section 8 sequence diagram.
> Merchant credentials (`MerchantID`, `Password`, `IntegritySalt`) and the registered return URL are issued by JazzCash. Never commit them to source control.

---

## 1. What you are building

JazzCash MWallet recurring flow has two phases:

1. **Link wallet (once per MSISDN)** — learner opens JazzCash hosted portal, enters OTP/MPIN on JazzCash UI, JazzCash returns a `pp_PaymentToken` to your return URL.
2. **Pay via token (many times)** — your server charges that stored token with Pay via Token. No MPIN on your site for later charges.

```text
Merchant app                JazzCash hosted portal              JazzCash APIs
     |                              |                                |
     |-- POST LinkWallet form ----->|                                |
     |                              |-- OTP + MPIN (user) ----------->|
     |<--------- redirect + token --|                                |
     |                                                               |
     |-- Pay via Token (server) ------------------------------------>|
     |<-- 000 success / failure -------------------------------------|
     |-- Status Inquiry (optional) --------------------------------->|
     |-- Token Inquiry / Delete (lifecycle) ------------------------>|
```

**Do not** collect MPIN or OTP in your own UI for this DOC flow. Those stay on JazzCash’s portal.

---

## 2. Credentials and configuration JazzCash must provide

Ask JazzCash for:

| Item | Purpose |
| --- | --- |
| `pp_MerchantID` | Merchant identifier (e.g. `MC990984`) |
| `pp_Password` | Merchant API password |
| Integrity Salt | Used as HMAC key for `pp_SecureHash` |
| Registered `pp_ReturnURL` | Exact HTTPS URL JazzCash will redirect to after linking |
| Environment | Live orchestrator host (see endpoints below) |

**Critical:** The return URL in your LinkWallet request must match an URL JazzCash has allowlisted for your merchant. Mismatch or a dead host causes “site can’t be reached” after OTP/MPIN even when linking succeeded.

Example staging return URL pattern:

```text
https://your-staging-host.example/callback
```

---

## 3. Base URLs (2026 DOC)

All paths below are under:

```text
https://onlinepayments.jazzcash.com.pk
```

| Capability | Method | Path |
| --- | --- | --- |
| Wallet linking portal (form POST) | `POST` `application/x-www-form-urlencoded` | `/payment-orchestrator/WalletLinkingPortal/wallet/LinkWallet` |
| Pay via Token (MWallet charge) | `POST` `application/json` | `/payment-orchestrator/api/v4/rest/payments/m-wallet` |
| Token Inquiry | `POST` `application/json` | `/payment-orchestrator/payment/api/v1/mobile-tokens/inquiry` |
| Delete Token | `POST` `application/json` | `/payment-orchestrator/payment/api/v1/mobile-tokens/delete` |
| Status Inquiry | `POST` `application/json` | `/payment-orchestrator/api/v2/rest/payments/status/inquiry` |
| IPN / async notification | JazzCash → your server | Merchant-configured notification URL (if enabled) |

Portal helper APIs used **by JazzCash’s frontend** during linking (you normally do not call these from your server; OTP/MPIN stay on JazzCash):

| Capability | Path |
| --- | --- |
| Verify OTP | `/payment-orchestrator/api/v2/payment-portal/payments/m-wallet/account-linking/verify-otp` |
| Complete account linking | `/payment-orchestrator/api/v2/payment-portal/payments/m-wallet/account-linking` |

---

## 4. SecureHash (mandatory for every signed request)

JazzCash 2026 DOC (Section 5 style):

1. Take all request fields whose names start with `pp_` **except** `pp_SecureHash`.
2. Drop empty / whitespace-only values.
3. Sort field **names** ascending by **ASCII** byte order (`"A" < "Z" < "a"`).  
   Do **not** use locale-aware sort (`localeCompare`) — it can produce an invalid hash.
4. Build message: `IntegritySalt & value1 & value2 & ... & valueN` (salt first, **no trailing `&`**).
5. `HMAC-SHA256(message, key=IntegritySalt)` → hex string → **UPPERCASE**.
6. Set `pp_SecureHash` to that value.

### Node.js reference

```js
import { createHmac } from "node:crypto";

export function jazzCashSecureHash(fields, integritySalt) {
  const values = Object.entries(fields)
    .filter(
      ([key, value]) =>
        key !== "pp_SecureHash" &&
        key.startsWith("pp_") &&
        String(value).trim().length > 0,
    )
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, value]) => String(value).trim());

  const message = [integritySalt, ...values].join("&");
  return createHmac("sha256", integritySalt)
    .update(message, "utf8")
    .digest("hex")
    .toUpperCase();
}
```

### Verify responses

When JazzCash returns `pp_SecureHash`, recompute the hash over the response `pp_*` fields (same rules) and compare in constant time before trusting the payload.

---

## 5. Who owns what (Frontend vs Backend)

| Concern | Frontend | Backend |
| --- | --- | --- |
| MerchantID / Password / IntegritySalt | Never | Yes — secrets only |
| SecureHash computation | Never in production UI | Yes |
| Collect MSISDN + consent | Yes | Validates format / auth |
| Start wallet link | Calls your API, then submits form JazzCash gives/returns | Creates intent, signs fields, returns form payload |
| OTP / MPIN | **JazzCash portal only** (not your screens) | N/A |
| Return `/callback` | May host the route that receives redirect | Must verify hash, store token, charge |
| Pay via Token / renewals | Shows status only | Server-to-server charge |
| Status / Token Inquiry / Delete / IPN | Optional status UI | All JazzCash HTTP + DB updates |
| Entitlement / “Premium active” | Displays from your API | Authoritative decision |

**Rule:** Frontend never decides payment success. Backend never asks the user for JazzCash MPIN/OTP in this DOC flow.

---

## 6. Backend steps (do these first)

### B0 — Prerequisites

1. HTTPS return URL registered with JazzCash (exact string).
2. Secret store: `MerchantID`, `Password`, `IntegritySalt`, return URL.
3. Suggested tables:
   - `wallet_link_intents` — `pp_RequestID`, user id, MSISDN, expiry, status
   - `wallet_links` — encrypted `pp_PaymentToken`, MSISDN, user id
   - `payment_orders` — amount, currency, `pp_TxnRefNo`, status, provider evidence
4. Never log Password, IntegritySalt, SecureHash, PaymentToken, MPIN, or OTP.

### B1 — Implement SecureHash helper

Use Section 4 (ASCII sort, no trailing `&`, uppercase hex). Unit-test it.

### B2 — API: start wallet link

Authenticated endpoint, e.g. `POST /api/billing/jazzcash/link/start`.

1. Require logged-in user.
2. Validate MSISDN (`03XXXXXXXXX` or agreed format).
3. Generate unique `pp_RequestID` (e.g. `ReqId` + timestamp + random hex).
4. Insert pending row in `wallet_link_intents`.
5. Build and sign fields:

| Field | Required | Notes |
| --- | --- | --- |
| `pp_MerchantID` | Yes | From secrets |
| `pp_Password` | Yes | From secrets |
| `pp_MSISDN` | Yes | From request |
| `pp_RequestID` | Yes | Unique per attempt |
| `pp_ReturnURL` | Yes | Must match JazzCash allowlist |
| `pp_SecureHash` | Yes | Section 4 |

6. Return JSON to frontend only (do not call JazzCash LinkWallet from the server):

```json
{
  "actionUrl": "https://onlinepayments.jazzcash.com.pk/payment-orchestrator/WalletLinkingPortal/wallet/LinkWallet",
  "fields": {
    "pp_MerchantID": "...",
    "pp_Password": "...",
    "pp_MSISDN": "...",
    "pp_RequestID": "...",
    "pp_ReturnURL": "...",
    "pp_SecureHash": "..."
  }
}
```

> `pp_Password` in the form is required by JazzCash’s hosted POST. Prefer short-lived one-time start responses over embedding secrets in static frontend bundles.

### B3 — API: complete wallet link (return URL handler)

Endpoint JazzCash hits, e.g. `GET|POST /callback` (or `/api/jazzcash/return` that the public URL maps to).

JazzCash typically sends:

- `pp_ResponseCode`, `pp_ResponseMessage`
- `pp_PaymentToken` (on success)
- `pp_RequestID`, `pp_MerchantID`, `pp_MSISDN`
- `pp_SecureHash`, `pp_ReturnUrl`

**Backend must:**

1. Collect all `pp_*` from query and/or form body.
2. Verify `pp_SecureHash`.
3. Load pending intent by `pp_RequestID` (and enforce ownership / session cookie).
4. Require `pp_ResponseCode === "000"` and non-empty `pp_PaymentToken`.
5. Store token encrypted; mark intent completed.
6. Optionally run **Pay via Token** immediately (B4).
7. Redirect browser to a frontend success/failure page (`/account?payment=succeeded` etc.).

Treat “already contains an active payment token” as success if token + hash are valid.

### B4 — Pay via Token (server-to-server)

**Endpoint:** `POST /payment-orchestrator/api/v4/rest/payments/m-wallet`  
**Content-Type:** `application/json`

| Field | Required | Notes |
| --- | --- | --- |
| `pp_MerchantID` | Yes | |
| `pp_Password` | Yes | |
| `pp_PaymentToken` | Yes | From `wallet_links` |
| `pp_TxnRefNo` | Yes | Unique; often max **20** chars |
| `pp_Amount` | Yes | Paisa string, e.g. `10000` = PKR 100.00 |
| `pp_BillReference` | Yes | |
| `pp_Description` | Yes | |
| `pp_TxnCurrency` | Yes | `PKR` |
| `pp_TxnDateTime` | Yes | `yyyyMMddHHmmss` |
| `pp_TxnExpiryDateTime` | Yes | `yyyyMMddHHmmss` |
| `pp_SecureHash` | Yes | |

Do **not** send MPIN/CNIC. Activate purchase only after `pp_ResponseCode = "000"` (and hash verify if present). Use the same API for one-time and recurring charges.

### B5 — Status Inquiry

**Endpoint:** `POST /payment-orchestrator/api/v2/rest/payments/status/inquiry`

| Field | Required |
| --- | --- |
| `pp_MerchantID` | Yes |
| `pp_Password` | Yes |
| `pp_TxnRefNo` | Yes |
| `pp_SecureHash` | Yes |

**Do not send `pp_Version`** on this URL (causes `110` invalid hash on live orchestrator).

Use for timeouts, pending orders, and ops reconciliation.

### B6 — Token Inquiry

**Endpoint:** `POST /payment-orchestrator/payment/api/v1/mobile-tokens/inquiry`

| Field | Required |
| --- | --- |
| `pp_RequestID` | Yes |
| `pp_MobileNumber` | Yes |
| `pp_MerchantID` | Yes |
| `pp_Password` | Yes |
| `pp_SecureHash` | Yes |

- Active: `000` + token  
- Missing: `999` — no token for MSISDN  

### B7 — Delete Token

**Endpoint:** `POST /payment-orchestrator/payment/api/v1/mobile-tokens/delete`

| Field | Required |
| --- | --- |
| `pp_RequestID` | Yes |
| `pp_MerchantID` | Yes |
| `pp_Password` | Yes |
| `pp_PaymentToken` | Yes |
| `pp_SecureHash` | Yes |

Call on unlink/cancel; clear local token; confirm with Token Inquiry (`999`).

### B8 — IPN (optional)

JazzCash → your backend only.

1. Confirm with JazzCash if IPN is enabled and the payload shape.
2. Implement HTTPS receiver: verify hash, match `pp_TxnRefNo`, update order idempotently, ACK.
3. If IPN is off, poll Status Inquiry with backoff.

### B9 — Backend APIs your frontend should call

Expose only your app APIs (examples):

| Frontend needs | Backend endpoint (example) |
| --- | --- |
| Start link | `POST /api/billing/jazzcash/link/start` `{ msisdn }` |
| Show link / premium status | `GET /api/billing/status` |
| Unlink wallet | `POST /api/billing/jazzcash/unlink` |
| (Optional) refresh payment status | `POST /api/billing/orders/:id/inquire` |

Frontend never calls JazzCash token/pay/status/delete URLs directly.

---

## 7. Frontend steps

### F0 — Prerequisites

1. Auth session (cookie/token) so start-link and callback completion are user-bound.
2. Pricing / checkout UI with MSISDN input + consent checkbox.
3. **No** MPIN field, **no** OTP field, **no** merchant secrets in the client bundle.

### F1 — Checkout / pricing UI

1. Show plan (monthly/yearly) and price.
2. Collect JazzCash mobile number.
3. Require explicit consent (“authorize link & charge”).
4. Disable submit until MSISDN + consent are valid.
5. On submit, call **backend** `link/start` (F2). Soft-disable button while waiting.

### F2 — Start link (call backend, then leave your site)

1. `POST` your backend start-link API with `{ msisdn }` (credentials: session cookie).
2. Receive `{ actionUrl, fields }`.
3. Dynamically build a form in the browser:

```html
<form method="POST" action="{actionUrl}">
  <!-- one hidden input per key in fields -->
</form>
```

4. `form.submit()` so the browser navigates to JazzCash LinkWallet (full page POST, not `fetch`/XHR).

Do not use AJAX to post to LinkWallet if JazzCash expects a top-level navigation into the portal.

### F3 — JazzCash hosted pages (not your code)

User completes OTP + MPIN on `onlinepayments.jazzcash.com.pk`.  
Your frontend has no work here except ensuring return URL is reachable afterward.

### F4 — Return / callback landing

JazzCash redirects to your registered return URL (often `/callback`).

**Preferred pattern:**

1. Frontend route or BFF receives GET/POST with `pp_*`.
2. Immediately forward fields to **backend complete-link** (or implement complete-link in the same server route).
3. Backend verifies + stores + charges.
4. Redirect user to a clean UI page, e.g. `/account?payment=succeeded|failed|pending`.

**Frontend must not:**

- Trust `pp_ResponseCode` alone without backend verification
- Store `pp_PaymentToken` in `localStorage`
- Show “Premium unlocked” until your backend status API says so

### F5 — Post-payment UX

1. Read `payment` / `orderId` query params or poll `GET /api/billing/status`.
2. Show success, pending, or failure copy.
3. Offer retry link only via a new backend `link/start` (new `pp_RequestID`).

### F6 — Account: unlink / cancel (optional UI)

1. Button “Unlink JazzCash” / “Cancel subscription”.
2. Call backend unlink API only.
3. Backend runs Delete Token + clears DB; frontend refreshes status.

### F7 — Frontend checklist

- [ ] MSISDN + consent UI  
- [ ] Calls backend start-link (no client-side hash with salt)  
- [ ] Full-page form POST to JazzCash `actionUrl`  
- [ ] No OTP/MPIN inputs in your app  
- [ ] Callback ends on account/success UI after backend completion  
- [ ] Status driven by your API, not JazzCash response alone  

---

## 8. End-to-end sequence (Frontend ↔ Backend ↔ JazzCash)

```text
FE                    BE                         JazzCash
|                     |                              |
|-- start link ------>|                              |
|                     |-- save intent                |
|                     |-- sign fields                |
|<-- actionUrl+fields-|                              |
|-- form POST -------------------------------------->| LinkWallet
|                     |                              |-- OTP/MPIN UI
|                     |<-- redirect/POST pp_* --------|
|                     |-- verify hash, save token    |
|                     |-- Pay via Token ------------>|
|                     |<-- 000 / fail ---------------|
|<-- redirect account-|                              |
|-- show status ------|                              |
```

---

## 9. Suggested product wiring (any app)

| User action | Frontend | Backend / JazzCash API |
| --- | --- | --- |
| Link & subscribe | MSISDN UI → form POST | LinkWallet → return → store token → Pay via Token |
| Renewal job | N/A (or status banner) | Pay via Token |
| Check payment | Status page | Status Inquiry |
| Is wallet linked? | Membership UI | Token Inquiry |
| Cancel / unlink | Confirm button | Delete Token + clear local token |
| Async push | N/A | IPN endpoint (optional) |

---

## 10. Amounts, IDs, and formats

| Topic | Rule |
| --- | --- |
| Amount | Integer **paisa** as string. `59900` = PKR 599.00 |
| Currency | `PKR` |
| Datetime | `yyyyMMddHHmmss` (merchant local / agreed JazzCash clock) |
| `pp_TxnRefNo` | Unique per charge; keep ≤ 20 characters for orchestrator compatibility |
| `pp_RequestID` | Unique per link / inquiry / delete call |
| MSISDN | Use the format JazzCash registered for tests (commonly `03XXXXXXXXX`) |

---

## 11. Response codes (practical)

| Code | Typical meaning |
| --- | --- |
| `000` | Success for that API |
| `110` | Invalid SecureHash / bad signed field set |
| `121` | Payment processed successfully (seen on status inquiry payment sub-code) |
| `999` | Business/technical failure or “no token” on inquiry |

Always branch on codes **and** verify hash before granting goods/services.

---

## 12. Minimal end-to-end test checklist

Use a JazzCash-approved test MSISDN. Do not paste live OTP/MPIN into tickets.

1. **Token Inquiry** — expect no token or existing token documented.  
2. **LinkWallet** — complete OTP/MPIN on portal; return URL must load.  
3. **Return handler** — hash OK, token stored.  
4. **Pay via Token** — small amount (e.g. `10000`); expect `000`.  
5. **Status Inquiry** — same `pp_TxnRefNo`; expect Completed / success codes.  
6. **Token Inquiry** — token still active.  
7. **Delete Token** — `000`.  
8. **Token Inquiry** — no token (`999`).  
9. **IPN** — if enabled, capture one notification and prove idempotent handling.

---

## 13. Common failures and fixes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| After MPIN, browser shows “site can’t be reached” | Return URL host down or not registered | Register live HTTPS URL with JazzCash; set same URL in LinkWallet |
| `110` invalid SecureHash | Wrong sort, trailing `&`, empty fields included, or extra fields | Use ASCII sort; exclude empties; match exact field set per API |
| Status Inquiry `110` | Sending `pp_Version` on v2 status inquiry | Omit `pp_Version`; hash only MerchantID, Password, TxnRefNo |
| Link OK but app never activates | Return handler not verifying hash / not charging | Verify hash server-side; call Pay via Token only after `000` + token |
| `999` no token on inquiry | Never linked, or already deleted | Run LinkWallet again |
| Pay fails after delete | Token revoked | Re-link before charging |
| OTP `123456` works only sometimes | Static OTP may apply only in special cases | Use real SMS OTP JazzCash sends for fresh links |

---

## 14. Security rules (non-negotiable)

1. Merchant Password and Integrity Salt: server-only secrets.  
2. Browser never decides payment success or entitlement.  
3. Encrypt `pp_PaymentToken` at rest; redact in logs.  
4. All state changes (activate, renew, cancel) are idempotent and audited.  
5. Timeouts on JazzCash HTTP calls; reject unexpected redirects on server-to-server calls.  
6. CORS / public pages must not expose credentials.

---

## 15. Reference: HTML LinkWallet bootstrap (portal / FE test only)

For manual portal testing. In production, `fields` come from your **backend** start-link API (Section 7 F2), not hardcoded secrets in HTML.

```html
<form method="post"
  action="https://onlinepayments.jazzcash.com.pk/payment-orchestrator/WalletLinkingPortal/wallet/LinkWallet">
  <input type="hidden" name="pp_MerchantID" value="FROM_BACKEND" />
  <input type="hidden" name="pp_Password" value="FROM_BACKEND" />
  <input type="hidden" name="pp_MSISDN" value="03XXXXXXXXX" />
  <input type="hidden" name="pp_RequestID" value="ReqId..." />
  <input type="hidden" name="pp_ReturnURL" value="https://your-host.example/callback" />
  <input type="hidden" name="pp_SecureHash" value="FROM_BACKEND" />
  <button type="submit">Link JazzCash Wallet</button>
</form>
```

---

## 16. API quick index

| # | API | Frontend | Backend |
| --- | --- | --- | --- |
| 1 | LinkWallet (hosted form) | Submits form from BE payload | Signs fields / returns `actionUrl` + `fields` |
| 2 | Return URL | Lands user / may host route | Verifies hash, stores token, charges |
| 3 | Pay via Token | Shows result only | Server-to-server charge |
| 4 | Status Inquiry | Optional status UI | Reconciliation |
| 5 | Token Inquiry | Optional membership UI | Support / pre-charge |
| 6 | Delete Token | Unlink button → your API | Revoke token |
| 7 | IPN | N/A | JazzCash → your server |
| — | Portal verify-otp / account-linking | JazzCash UI only | Do not rebuild in your app |

---

## 17. Document ownership

- **Authoritative field lists / merchant enablement:** JazzCash *MWallet Recurring Payments (2026)* pack + your merchant email from JazzCash.  
- **This guide:** practical integration steps aligned to that DOC and live orchestrator behavior (including Status Inquiry without `pp_Version`).  
- If JazzCash’s merchant-specific pack differs, the **merchant pack wins**.

---

## 18. Handoff checklist for a new developer

### Backend

- [ ] Secrets stored server-side (MerchantID, Password, IntegritySalt, return URL)  
- [ ] Return URL registered with JazzCash and reachable over HTTPS  
- [ ] SecureHash helper unit-tested (ASCII sort, no trailing `&`)  
- [ ] `link/start` creates intent and returns signed form fields  
- [ ] Return/callback verifies hash before storing token  
- [ ] Pay via Token server-side  
- [ ] Status Inquiry for pending orders  
- [ ] Token Inquiry + Delete for lifecycle  
- [ ] IPN stub or explicit decision to use Status Inquiry only  
- [ ] No secrets in git or logs  

### Frontend

- [ ] MSISDN + consent UI (no OTP/MPIN fields)  
- [ ] Calls backend `link/start` only  
- [ ] Full-page form POST to JazzCash `actionUrl`  
- [ ] Callback leads to account/success UI after backend completion  
- [ ] Premium/payment status read from your backend API  
- [ ] Unlink/cancel calls your backend only  
