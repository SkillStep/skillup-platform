import { createHmac } from "node:crypto";

import type { ApiConfig } from "./config.js";

export type JazzCashV11Fields = Readonly<Record<string, string>>;

export type JazzCashWalletLinkFields = Readonly<{
  actionUrl: string;
  fields: Readonly<Record<string, string>>;
}>;

export type JazzCashTokenChargeInput = Readonly<{
  amountMinor: number;
  billReference: string;
  description: string;
  paymentToken: string;
  txnRefNo: string;
  txnDateTime: string;
  txnExpiryDateTime: string;
}>;

export type JazzCashV11Client = Readonly<{
  buildWalletLinkForm: (
    input: Readonly<{ msisdn: string; requestId: string }>,
  ) => JazzCashWalletLinkFields;
  chargeWithToken: (input: JazzCashTokenChargeInput) => Promise<JazzCashV11Fields>;
  inquireToken: (
    input: Readonly<{ requestId: string; mobileNumber: string }>,
  ) => Promise<JazzCashV11Fields>;
  deleteToken: (
    input: Readonly<{ requestId: string; paymentToken: string }>,
  ) => Promise<JazzCashV11Fields>;
  inquirePaymentStatus: (input: Readonly<{ txnRefNo: string }>) => Promise<JazzCashV11Fields>;
}>;

class JazzCashV11Error extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable = true) {
    super(message);
    this.name = "JazzCashV11Error";
    this.retryable = retryable;
  }
}

/**
 * JazzCash MWALLET recurring hash (2026 DOC):
 * IntegritySalt & sorted(non-empty pp_* values excluding pp_SecureHash), HMAC-SHA256, hex uppercase.
 */
export function jazzCashV11SecureHash(
  fields: Readonly<Record<string, string>>,
  integritySalt: string,
): string {
  const values = Object.entries(fields)
    .filter(
      ([key, value]) => key !== "pp_SecureHash" && key.startsWith("pp_") && value.trim().length > 0,
    )
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, value]) => value.trim());
  const message = [integritySalt, ...values].join("&");
  return createHmac("sha256", integritySalt).update(message, "utf8").digest("hex").toUpperCase();
}

export function verifyJazzCashV11SecureHash(
  fields: Readonly<Record<string, string>>,
  integritySalt: string,
): boolean {
  const provided = fields["pp_SecureHash"]?.trim().toUpperCase();
  if (!provided || !/^[A-F0-9]{64}$/.test(provided)) return false;
  const expected = jazzCashV11SecureHash(fields, integritySalt);
  if (provided.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < provided.length; index += 1) {
    mismatch |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return mismatch === 0;
}

export function redactJazzCashV11Fields(
  fields: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (
      key === "pp_Password" ||
      key === "pp_SecureHash" ||
      key === "pp_PaymentToken" ||
      key === "pp_MPIN" ||
      key === "pp_CNIC" ||
      key.toLowerCase().includes("password") ||
      key.toLowerCase().includes("token") ||
      key.toLowerCase().includes("mpin") ||
      key.toLowerCase().includes("hash") ||
      key.toLowerCase().includes("salt")
    ) {
      redacted[key] = "[redacted]";
      continue;
    }
    redacted[key] = value;
  }
  return redacted;
}

function requireV11Config(config: ApiConfig): Readonly<{
  merchantId: string;
  password: string;
  integritySalt: string;
  returnUrl: string;
  linkUrl: string;
  chargeUrl: string;
  tokenInquiryUrl: string;
  tokenDeleteUrl: string;
  statusInquiryUrl: string;
  timeoutMs: number;
}> {
  if (
    !config.JAZZCASH_V11_MERCHANT_ID ||
    !config.JAZZCASH_V11_PASSWORD ||
    !config.JAZZCASH_V11_INTEGRITY_SALT ||
    !config.JAZZCASH_V11_RETURN_URL ||
    !config.JAZZCASH_V11_URL ||
    !config.JAZZCASH_V11_LINK_URL ||
    !config.JAZZCASH_V11_TOKEN_INQUIRY_URL ||
    !config.JAZZCASH_V11_TOKEN_DELETE_URL ||
    !config.JAZZCASH_V11_INQUIRY_URL
  ) {
    throw new JazzCashV11Error(
      "JazzCash MWALLET recurring checkout is not fully configured.",
      false,
    );
  }
  return {
    merchantId: config.JAZZCASH_V11_MERCHANT_ID,
    password: config.JAZZCASH_V11_PASSWORD,
    integritySalt: config.JAZZCASH_V11_INTEGRITY_SALT,
    returnUrl: config.JAZZCASH_V11_RETURN_URL,
    linkUrl: config.JAZZCASH_V11_LINK_URL,
    chargeUrl: config.JAZZCASH_V11_URL,
    tokenInquiryUrl: config.JAZZCASH_V11_TOKEN_INQUIRY_URL,
    tokenDeleteUrl: config.JAZZCASH_V11_TOKEN_DELETE_URL,
    statusInquiryUrl: config.JAZZCASH_V11_INQUIRY_URL,
    timeoutMs: config.JAZZCASH_V11_TIMEOUT_MS ?? 30_000,
  };
}

function stringRecord(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      record[key] = String(value);
    }
  }
  return record;
}

function responseRecord(input: unknown): JazzCashV11Fields {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const record: Record<string, string> = { ...stringRecord(input) };
  for (const value of Object.values(input)) {
    Object.assign(record, stringRecord(value));
  }
  return record;
}

async function postJson(
  fetcher: typeof fetch,
  url: string,
  body: Readonly<Record<string, string>>,
  timeoutMs: number,
): Promise<JazzCashV11Fields> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new JazzCashV11Error("The JazzCash orchestrator request could not reach the provider.");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new JazzCashV11Error("JazzCash returned a non-JSON response.", false);
  }
  if (!response.ok) {
    throw new JazzCashV11Error(`JazzCash HTTP ${response.status}.`, response.status >= 500);
  }
  return responseRecord(payload);
}

/** Wallet-link hosted form fields (DOC §5). */
export function buildJazzCashWalletLinkForm(
  config: ApiConfig,
  input: Readonly<{ msisdn: string; requestId: string }>,
): JazzCashWalletLinkFields {
  const provider = requireV11Config(config);
  const fields: Record<string, string> = {
    pp_MerchantID: provider.merchantId,
    pp_Password: provider.password,
    pp_MSISDN: input.msisdn,
    pp_RequestID: input.requestId,
    pp_ReturnURL: provider.returnUrl,
  };
  fields["pp_SecureHash"] = jazzCashV11SecureHash(fields, provider.integritySalt);
  return { actionUrl: provider.linkUrl, fields };
}

export function buildJazzCashTokenChargeFields(
  config: ApiConfig,
  input: JazzCashTokenChargeInput,
): Record<string, string> {
  const provider = requireV11Config(config);
  const fields: Record<string, string> = {
    pp_MerchantID: provider.merchantId,
    pp_Password: provider.password,
    pp_PaymentToken: input.paymentToken,
    pp_TxnRefNo: input.txnRefNo,
    pp_Amount: String(input.amountMinor),
    pp_BillReference: input.billReference,
    pp_Description: input.description,
    pp_TxnCurrency: "PKR",
    pp_TxnDateTime: input.txnDateTime,
    pp_TxnExpiryDateTime: input.txnExpiryDateTime,
  };
  fields["pp_SecureHash"] = jazzCashV11SecureHash(fields, provider.integritySalt);
  return fields;
}

export function createJazzCashV11Client(
  config: ApiConfig,
  fetcher: typeof fetch = fetch,
): JazzCashV11Client {
  const provider = requireV11Config(config);

  return {
    buildWalletLinkForm: (input) => buildJazzCashWalletLinkForm(config, input),

    chargeWithToken: async (input) => {
      const body = buildJazzCashTokenChargeFields(config, input);
      return postJson(fetcher, provider.chargeUrl, body, provider.timeoutMs);
    },

    inquireToken: async ({ requestId, mobileNumber }) => {
      const fields: Record<string, string> = {
        pp_RequestID: requestId,
        pp_MobileNumber: mobileNumber,
        pp_MerchantID: provider.merchantId,
        pp_Password: provider.password,
      };
      fields["pp_SecureHash"] = jazzCashV11SecureHash(fields, provider.integritySalt);
      return postJson(fetcher, provider.tokenInquiryUrl, fields, provider.timeoutMs);
    },

    deleteToken: async ({ requestId, paymentToken }) => {
      const fields: Record<string, string> = {
        pp_RequestID: requestId,
        pp_MerchantID: provider.merchantId,
        pp_Password: provider.password,
        pp_PaymentToken: paymentToken,
      };
      fields["pp_SecureHash"] = jazzCashV11SecureHash(fields, provider.integritySalt);
      return postJson(fetcher, provider.tokenDeleteUrl, fields, provider.timeoutMs);
    },

    inquirePaymentStatus: async ({ txnRefNo }) => {
      // Orchestrator status inquiry (/api/v2/rest/payments/status/inquiry) accepts
      // merchant credentials + txn ref + hash only. Including pp_Version changes the
      // HMAC input and JazzCash returns 110 (invalid pp_SecureHash).
      const fields: Record<string, string> = {
        pp_MerchantID: provider.merchantId,
        pp_Password: provider.password,
        pp_TxnRefNo: txnRefNo,
      };
      fields["pp_SecureHash"] = jazzCashV11SecureHash(fields, provider.integritySalt);
      return postJson(fetcher, provider.statusInquiryUrl, fields, provider.timeoutMs);
    },
  };
}

export { JazzCashV11Error };
