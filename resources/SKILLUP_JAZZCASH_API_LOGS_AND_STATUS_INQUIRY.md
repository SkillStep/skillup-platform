# SkillUp — JazzCash Token Inquiry / Delete Token logs + Status Inquiry confirmation

**Project:** SkillUp Premium (MWALLET Recurring — wallet-link + PayViaToken)  
**Merchant ID:** `MC990984`  
**Base URL:** `https://onlinepayments.jazzcash.com.pk`  
**Staging app:** `https://skillupshop.codistan.org`

---

## 1. Token Inquiry API

**Endpoint:** `POST /payment-orchestrator/payment/api/v1/mobile-tokens/inquiry`  
**Content-Type:** `application/json`

### Request

```json
{
  "pp_RequestID": "<unique-request-id>",
  "pp_MobileNumber": "03123456789",
  "pp_MerchantID": "MC990984",
  "pp_Password": "***",
  "pp_SecureHash": "***"
}
```

### Response (token present)

```json
{
  "pp_ResponseCode": "000",
  "pp_ResponseMessage": "***",
  "pp_MobileNumber": "03123456789",
  "pp_PaymentToken": "***",
  "pp_SecureHash": "***"
}
```

### Response (no token — after delete)

```json
{
  "pp_ResponseCode": "999",
  "pp_ResponseMessage": "No Payment Token exists against the provided pp_MobileNumber.",
  "pp_SecureHash": "***"
}
```

**Where implemented (SkillUp):** `apps/api/src/jazzcash-v11.ts` → `inquireToken()`  
Uses env `JAZZCASH_V11_TOKEN_INQUIRY_URL`.

**Expected verification pattern:** Inquiry → `000` (active token) → after Delete Token → Inquiry → `999`.

---

## 2. Delete Token API

**Endpoint:** `POST /payment-orchestrator/payment/api/v1/mobile-tokens/delete`  
**Content-Type:** `application/json`

### Request

```json
{
  "pp_RequestID": "<unique-request-id>",
  "pp_MerchantID": "MC990984",
  "pp_Password": "***",
  "pp_PaymentToken": "***",
  "pp_SecureHash": "***"
}
```

### Response

```json
{
  "pp_ResponseCode": "000",
  "pp_ResponseMessage": "***",
  "pp_SecureHash": "***"
}
```

**Where implemented (SkillUp):** `apps/api/src/jazzcash-v11.ts` → `deleteToken()`  
Uses env `JAZZCASH_V11_TOKEN_DELETE_URL`.  
Used for payment-token lifecycle teardown when the learner unlinks / tears down JazzCash wallet authorization.

**Expected verification pattern:** Delete Token → `000` success → Token Inquiry → `999`.

---

## 3. Status Inquiry API — implemented

**Endpoint:** `POST /payment-orchestrator/api/v2/rest/payments/status/inquiry`  
**Content-Type:** `application/json`  
*(SkillUp does **not** send `pp_Version` on this call. Including it changes the HMAC input and JazzCash returns invalid `pp_SecureHash` / code `110`.)*

### Request

```json
{
  "pp_MerchantID": "MC990984",
  "pp_Password": "***",
  "pp_TxnRefNo": "<txn-ref-no>",
  "pp_SecureHash": "***"
}
```

### Response

```json
{
  "pp_ResponseCode": "000",
  "pp_ResponseMessage": "***",
  "pp_TxnRefNo": "<txn-ref-no>",
  "pp_SecureHash": "***"
}
```

**Where implemented (SkillUp):**
- Client: `apps/api/src/jazzcash-v11.ts` → `inquirePaymentStatus()`
- Billing: `apps/api/src/jazzcash-v11-billing.ts` → `inquire()`
- SkillUp route: `POST /v1/premium/billing/jazzcash-v11/inquiry`

Used to reconcile payment status by `pp_TxnRefNo` (pending / timeout / incomplete browser-return cases) before treating Premium as confirmed.

---

## 4. Return URL / callback — implemented

**Primary Return URL (preferred for JazzCash allowlist):**  
`https://skillupshop.codistan.org/en/account/payment-return`  
(POST/GET — accepts `pp_*` fields)

**Compatibility Return URL:**  
`https://skillupshop.codistan.org/callback`

**Where implemented (SkillUp):**
- `apps/web/app/[locale]/account/payment-return/route.ts`
- `apps/web/app/callback/route.ts` (compat)
- Completes via `POST /v1/premium/billing/jazzcash-v11/link/complete`

Flow after JazzCash posts/redirects to Return URL:
1. Verify `pp_SecureHash` and resolve wallet-link intent by `pp_RequestID`
2. Store `pp_PaymentToken`
3. Charge via **PayViaToken** (`/payment-orchestrator/api/v4/rest/payments/m-wallet`)
4. Confirm status (PayViaToken response and/or Status Inquiry)
5. Activate Premium entitlement
6. Redirect learner to SkillUp home: `https://skillupshop.codistan.org/en?payment=<status>`

---

## 5. IPN

**Receiver (implemented):** `POST https://skillupshop.codistan.org/jazzcash/ipn`  
Alias: `POST https://skillupshop.codistan.org/en/account/jazzcash-ipn`  

Updates payment status from JazzCash notification (`pp_TxnRefNo` / `pp_ResponseCode`) after SecureHash verification and returns `200 OK`.  
Please allowlist/register this URL for merchant `MC990984`.

---

## 6. Related SkillUp checkout endpoints

| Step | SkillUp API |
| --- | --- |
| Start wallet link (hosted form fields) | `POST /v1/premium/billing/jazzcash-v11/link/start` |
| Complete wallet link (from Return URL) | `POST /v1/premium/billing/jazzcash-v11/link/complete` |
| Status inquiry (by txn ref) | `POST /v1/premium/billing/jazzcash-v11/inquiry` |
| JazzCash LinkWallet portal | `JAZZCASH_V11_LINK_URL` (hosted form POST) |
| JazzCash PayViaToken | `JAZZCASH_V11_URL` → `/api/v4/rest/payments/m-wallet` |

Public Premium landing (client UTM):  
`https://skillupshop.codistan.org/mainLanding?utm=D&package=default&parameter=default&payment=jazzcash`

---

## 7. Allowlist / registration ask (JazzCash)

Please allowlist / register for Merchant **`MC990984`** if not already done:

1. **Return URL:** `https://skillupshop.codistan.org/en/account/payment-return`
2. **Compatibility Return URL (if needed):** `https://skillupshop.codistan.org/callback`
3. **IPN URL:** _(confirm if required)_

---

## 8. Config reference (no secrets)

```text
JAZZCASH_V11_LINK_URL=https://onlinepayments.jazzcash.com.pk/payment-orchestrator/WalletLinkingPortal/wallet/LinkWallet
JAZZCASH_V11_URL=https://onlinepayments.jazzcash.com.pk/payment-orchestrator/api/v4/rest/payments/m-wallet
JAZZCASH_V11_TOKEN_INQUIRY_URL=https://onlinepayments.jazzcash.com.pk/payment-orchestrator/payment/api/v1/mobile-tokens/inquiry
JAZZCASH_V11_TOKEN_DELETE_URL=https://onlinepayments.jazzcash.com.pk/payment-orchestrator/payment/api/v1/mobile-tokens/delete
JAZZCASH_V11_INQUIRY_URL=https://onlinepayments.jazzcash.com.pk/payment-orchestrator/api/v2/rest/payments/status/inquiry
JAZZCASH_V11_MERCHANT_ID=MC990984
JAZZCASH_V11_RETURN_URL=https://skillupshop.codistan.org/en/account/payment-return
```

Passwords, integrity salt, payment tokens, and secure hashes must never be committed or pasted into tickets/chat.
