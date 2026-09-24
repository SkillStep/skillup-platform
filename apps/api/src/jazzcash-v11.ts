import { createHmac } from "node:crypto";

import type { ApiConfig } from "./config.js";

export type JazzCashV11Fields = Readonly<Record<string, string>>;

export type JazzCashV11ChargeInput = Readonly<{
  amountMinor: number;
  billReference: string;
  description: string;
  txnRefNo: string;
  txnDateTime: string;
  txnExpiryDateTime: string;
  msisdn: string;
  mpin: string;
  cnic: string;
}>;

export type JazzCashV11Client = Readonly<{
  charge: (input: JazzCashV11ChargeInput) => Promise<JazzCashV11Fields>;
  inquire: (input: Readonly<{ txnRefNo: string }>) => Promise<JazzCashV11Fields>;
}>;

class JazzCashV11Error extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable = true) {
    super(message);
    this.name = "JazzCashV11Error";
    this.retryable = retryable;
  }
}

/** Classic MWALLET fields only — never include pp_MobileNumber / pp_CNIC / pp_MPIN. */
export function jazzCashV11SecureHash(
  fields: Readonly<Record<string, string>>,
  integritySalt: string,
): string {
  const values = Object.entries(fields)
    .filter(
      ([key, value]) =>
        key !== "pp_SecureHash" &&
        key !== "pp_MobileNumber" &&
        key !== "pp_CNIC" &&
        key !== "pp_MPIN" &&
        key.startsWith("pp") &&
        value.trim().length > 0,
    )
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, value]) => value);
  const message = [integritySalt, ...values].join("&");
  return createHmac("sha256", integritySalt).update(message, "utf8").digest("hex").toUpperCase();
}

export function redactJazzCashV11Fields(
  fields: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (
      key === "pp_Password" ||
      key === "pp_SecureHash" ||
      key === "pp_MPIN" ||
      key === "pp_CNIC" ||
      key.toLowerCase().includes("password") ||
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
    throw new JazzCashV11Error("The JazzCash orchestrator returned invalid JSON.", false);
  }

  const fields = responseRecord(payload);
  if (!response.ok && Object.keys(fields).length === 0) {
    throw new JazzCashV11Error(
      `The JazzCash orchestrator returned HTTP ${response.status}.`,
      response.status >= 500,
    );
  }
  if (Object.keys(fields).length === 0) {
    throw new JazzCashV11Error("The JazzCash orchestrator returned an empty response.", false);
  }
  return fields;
}

function requireV11Config(config: ApiConfig): Readonly<{
  merchantId: string;
  password: string;
  integritySalt: string;
  chargeUrl: string;
  inquiryUrl: string;
  returnUrl: string;
  timeoutMs: number;
}> {
  if (
    !config.JAZZCASH_V11_MERCHANT_ID ||
    !config.JAZZCASH_V11_PASSWORD ||
    !config.JAZZCASH_V11_INTEGRITY_SALT ||
    !config.JAZZCASH_V11_URL ||
    !config.JAZZCASH_V11_INQUIRY_URL ||
    !config.JAZZCASH_V11_RETURN_URL
  ) {
    throw new JazzCashV11Error("JazzCash v11 is not fully configured.", false);
  }
  return {
    merchantId: config.JAZZCASH_V11_MERCHANT_ID,
    password: config.JAZZCASH_V11_PASSWORD,
    integritySalt: config.JAZZCASH_V11_INTEGRITY_SALT,
    chargeUrl: config.JAZZCASH_V11_URL,
    inquiryUrl: config.JAZZCASH_V11_INQUIRY_URL,
    returnUrl: config.JAZZCASH_V11_RETURN_URL,
    timeoutMs: config.JAZZCASH_V11_TIMEOUT_MS ?? 30_000,
  };
}

export function buildJazzCashV11ChargeFields(
  config: ApiConfig,
  input: JazzCashV11ChargeInput,
): Record<string, string> {
  const provider = requireV11Config(config);
  const classic: Record<string, string> = {
    pp_Amount: String(input.amountMinor),
    pp_BillReference: input.billReference,
    pp_Description: input.description,
    pp_Language: "EN",
    pp_MerchantID: provider.merchantId,
    pp_Password: provider.password,
    pp_ReturnURL: provider.returnUrl,
    pp_TxnCurrency: "PKR",
    pp_TxnDateTime: input.txnDateTime,
    pp_TxnExpiryDateTime: input.txnExpiryDateTime,
    pp_TxnRefNo: input.txnRefNo,
    pp_TxnType: "MWALLET",
    pp_Version: "1.1",
    // Classic MWALLET optional merchant fields — hashed when non-empty.
    ppmpf_1: input.msisdn,
  };
  classic["pp_SecureHash"] = jazzCashV11SecureHash(classic, provider.integritySalt);
  // Sensitive wallet fields must be added AFTER the hash (including them causes 110 SecureHash).
  classic["pp_MobileNumber"] = input.msisdn;
  classic["pp_CNIC"] = input.cnic;
  classic["pp_MPIN"] = input.mpin;
  return classic;
}

export function createJazzCashV11Client(
  config: ApiConfig,
  fetcher: typeof fetch = fetch,
): JazzCashV11Client {
  const provider = requireV11Config(config);

  return {
    charge: async (input) => {
      const body = buildJazzCashV11ChargeFields(config, input);
      return postJson(fetcher, provider.chargeUrl, body, provider.timeoutMs);
    },

    inquire: async ({ txnRefNo }) => {
      // JazzCash Transaction Status Inquiry accepts exactly the merchant transaction
      // reference, merchant credentials, API version and secure hash. Do not reuse
      // charge-only fields here: extra fields change the HMAC input and produce 110.
      const fields: Record<string, string> = {
        pp_MerchantID: provider.merchantId,
        pp_Password: provider.password,
        pp_TxnRefNo: txnRefNo,
        pp_Version: "1.1",
      };
      fields["pp_SecureHash"] = jazzCashV11SecureHash(fields, provider.integritySalt);
      return postJson(fetcher, provider.inquiryUrl, fields, provider.timeoutMs);
    },
  };
}

export { JazzCashV11Error };
