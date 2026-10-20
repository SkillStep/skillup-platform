# SkillUp — JazzCash PGW Production Signoff Grid

**Date:** 2026-10-07  
**Product:** SkillUp Premium  
**Staging host:** https://skillupshop.codistan.org  
**Merchant ID (staging / current):** `MC990984`  
**Integration mode:** MWallet Recurring Payment (wallet-link + PayViaToken, JazzCash DOC 2026)  
**Prepared from:** current SkillUp repository implementation + staging configuration

---

Hi Merchant,

Before we proceed with enabling the SkillUp merchant account on the new PGW Production environment, the following implementation requirements have been reviewed against the live SkillUp codebase.

## 1. Implementation requirements

| Sr. No. | Requirement | Status | SkillUp evidence / notes |
| --- | --- | --- | --- |
| 1 | Hash generation implemented for all outgoing requests | **Implemented** | Server-side HMAC-SHA256 SecureHash for LinkWallet, PayViaToken, Token Inquiry, Delete Token, and Status Inquiry (`apps/api/src/jazzcash-v11.ts` → `jazzCashV11SecureHash`). |
| 2 | Hash validation implemented for all incoming responses | **Implemented** | Return/callback fields verified with `verifyJazzCashV11SecureHash` before storing payment token or activating Premium (`link/complete` + payment-return handlers). |
| 3 | Hashing logic is implemented strictly on the server side (client-side hashing is not allowed) | **Implemented** | Browser never receives merchant password, integrity salt, or SecureHash inputs. Web posts only to JazzCash hosted LinkWallet using server-built signed fields. |
| 4 | Response handling is properly mapped (Success: `000`/`121`, Pending: `124`/`157`, Failure: all other codes) | **Implemented** | Provider outcome mapping includes success `000`/`121`/`200`, pending `119`/`124`/`157`/`210`, cancelled `112`, expired `116`, refunded `131`; all other codes treated as failure (`apps/api/src/commercial.ts` → `providerOutcome`). Wallet-link completion requires `000` + `pp_PaymentToken` before PayViaToken / Premium activation. |
| 5 | “Status Inquiry” or “IPN” API implemented | **Implemented (both)** | **Status Inquiry:** `POST .../api/v2/rest/payments/status/inquiry` via `inquirePaymentStatus()` + SkillUp `POST /v1/premium/billing/jazzcash-v11/inquiry` and admin Status Inquiry queue. **IPN:** public HTTPS receiver `POST https://skillupshop.codistan.org/jazzcash/ipn` (alias `/en/account/jazzcash-ipn`) → API `POST /v1/commercial/jazzcash/ipn` verifies SecureHash (classic or V11), updates order/entitlement idempotently, returns HTTP 200. |
| 6 | “Refund” API implemented (if applicable as per business/refund policy) | **Implemented** | Refund and Cancellation Policy at `/en/legal/refund`. Payment operators with `payment.reconcile` queue full provider refunds via admin Payments tab → `POST /v1/admin/reports/premium/payments/:id/refunds` (server supplies settled order amount/currency; browser cannot choose amount). CPS Refund client uses classic JazzCash credentials or V11 merchant + `JAZZCASH_V11_REFUND_URL`. Accepted refund marks order/entitlement refunded and removes Premium capability. |

---

## 2. Production activation details

Once the items above are accepted, the following details are provided so JazzCash can proceed with Production access setup.

| Field | Value |
| --- | --- |
| Merchant Company Name | *(leave empty — JazzCash / commercial to confirm)* |
| CPS Live ID | *(leave empty — JazzCash to issue/confirm for production)* |
| Live Website URL | Staging (current verification host): https://skillupshop.codistan.org  · Production website URL: *(to be confirmed before go-live; not assumed)* |
| Payment Methods — Credit/Debit Card | **No** |
| Payment Methods — MWallet API v1.1 (without CNIC) | **No** |
| Payment Methods — MWallet API v2.0 (with CNIC) | **No** |
| Payment Methods — MWallet Recurring Payment | **Yes** |
| Payment Methods — Any other | **No** |
| Business Point of Contact Name | *(merchant / Codistan commercial contact — fill before JazzCash send)* |
| Business Point of Contact Mobile No | `+92 319 9811263` *(Pakistan mobile — OTP-capable; confirm final production POC number before send)* |
| Business Point of Contact Email ID | `admin@codistan.org` |
| Business Point of CNIC | *(leave for authorized Pakistani POC — fill before JazzCash send)* |
| Nature of Business | *(leave empty)* |
| Agreed Pricing (%) | *(leave empty)* |
| Return URL | **https://skillupshop.codistan.org/en/account/payment-return**  · Compatibility (also supported): https://skillupshop.codistan.org/callback |
| IPN URL (if applicable) | **https://skillupshop.codistan.org/jazzcash/ipn** (alias: https://skillupshop.codistan.org/en/account/jazzcash-ipn). Please allowlist/register for Merchant **MC990984**. Production host URL TBD when Live Website URL is confirmed. |

---

## 3. SkillUp integration summary (for JazzCash)

### Checkout model
1. Learner selects Premium plan on SkillUp (`/en/pricing`) and continues to landing:  
   `https://skillupshop.codistan.org/mainLanding?utm=D&package=default&parameter=default&payment=jazzcash`
2. Learner enters JazzCash MSISDN and consents → SkillUp starts wallet-link (`POST /v1/premium/billing/jazzcash-v11/link/start`).
3. Browser POSTs signed form to JazzCash **LinkWallet** portal; OTP/MPIN entered only on JazzCash.
4. JazzCash returns to SkillUp **Return URL** with `pp_PaymentToken`.
5. SkillUp verifies SecureHash, stores token, charges via **PayViaToken**, reconciles via Status Inquiry when needed, then activates Premium.
6. Learner is redirected to SkillUp home with payment status:  
   `https://skillupshop.codistan.org/en?payment=<status>`

### JazzCash APIs used by SkillUp

| Capability | Endpoint |
| --- | --- |
| LinkWallet (hosted) | `/payment-orchestrator/WalletLinkingPortal/wallet/LinkWallet` |
| PayViaToken | `/payment-orchestrator/api/v4/rest/payments/m-wallet` |
| Token Inquiry | `/payment-orchestrator/payment/api/v1/mobile-tokens/inquiry` |
| Delete Token | `/payment-orchestrator/payment/api/v1/mobile-tokens/delete` |
| Status Inquiry | `/payment-orchestrator/api/v2/rest/payments/status/inquiry` *(no `pp_Version`)* |

Supporting SkillUp notes: `resources/SKILLUP_JAZZCASH_API_LOGS_AND_STATUS_INQUIRY.md`

### Allowlist / registration ask
Please allowlist/register for Merchant **`MC990984`** (and the production merchant ID once issued):

1. Return URL: `https://skillupshop.codistan.org/en/account/payment-return`
2. Compatibility Return URL (if needed): `https://skillupshop.codistan.org/callback`
3. IPN URL: `https://skillupshop.codistan.org/jazzcash/ipn`

---

## 4. Open items before Production enablement

| Item | Owner | Status |
| --- | --- | --- |
| Confirm / fill Merchant Company Name, CPS Live ID, Nature of Business, Agreed Pricing | JazzCash / commercial | Open (left empty per JazzCash template) |
| Confirm final Production Live Website URL | SkillUp / commercial | Open |
| Confirm Business POC name + CNIC for portal OTP | Codistan / merchant | Open (mobile + email provided) |
| Allowlist/register IPN URL on production merchant | JazzCash | Requested (`/jazzcash/ipn`) |
| Confirm / configure production Refund URL secret (`JAZZCASH_V11_REFUND_URL` or classic `JAZZCASH_REFUND_URL`) | SkillUp ops | Required before live refunds |
| Allowlist Return URL(s) on production merchant | JazzCash | Requested |
| Production merchant credentials (separate from staging `MC990984`) | JazzCash | Required before production traffic |
| Final production go-live authorization (product / finance / security) | SkillUp | Required after JazzCash activation |

---

## 5. Security notes

- Merchant password, integrity salt, payment tokens, SecureHash values, and session cookies must never be shared in email/chat/tickets.
- SkillUp fails closed unless Premium/JazzCash feature flags and server config are explicitly enabled for the target environment.
- Staging and production must use separate JazzCash credentials.

Please share/confirm the open commercial fields above so Production PGW access can proceed.
