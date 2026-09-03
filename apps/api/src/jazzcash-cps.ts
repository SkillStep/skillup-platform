import { createHash } from "node:crypto";

import type { ApiConfig } from "./config.js";
import { jazzCashSecureHash, verifyJazzCashSecureHash } from "./commercial.js";

type FetchLike = typeof fetch;

type ProviderRecord = Readonly<Record<string, string>>;

export type JazzCashCpsEvidence = Readonly<{
  operation: "status" | "refund";
  responseCode: string | null;
  responseMessage: string | null;
  providerStatus: string | null;
  providerReference: string | null;
  signatureVerified: boolean | null;
  payloadDigest: string;
  accepted: boolean;
}>;

export type JazzCashCpsClient = Readonly<{
  inquire: (input: Readonly<{ merchantReference: string }>) => Promise<JazzCashCpsEvidence>;
  refund: (
    input: Readonly<{
      merchantReference: string;
      amountMinor: number;
      currency: "PKR";
    }>,
  ) => Promise<JazzCashCpsEvidence>;
}>;

class JazzCashCpsError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable = true) {
    super(message);
    this.name = "JazzCashCpsError";
    this.retryable = retryable;
  }
}

function stringRecord(input: unknown): ProviderRecord {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      record[key] = String(value);
    }
  }
  return record;
}

function responseRecord(input: unknown): ProviderRecord {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const record: Record<string, string> = { ...stringRecord(input) };
  for (const value of Object.values(input)) {
    Object.assign(record, stringRecord(value));
  }
  return record;
}

function canonicalDigest(fields: ProviderRecord): string {
  const canonical = Object.fromEntries(
    Object.entries(fields)
      .filter(([key]) => key !== "pp_Password" && key !== "pp_SecureHash" && key !== "secureHash")
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function pick(fields: ProviderRecord, ...keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = fields[key]?.trim();
    if (value) return value;
  }
  return null;
}

function validateResponseSignature(fields: ProviderRecord, integritySalt: string): boolean | null {
  const presented = pick(fields, "pp_SecureHash", "secureHash");
  if (!presented) return null;
  if (!fields["pp_SecureHash"] && fields["secureHash"]) {
    return null;
  }
  return verifyJazzCashSecureHash(fields, integritySalt);
}

async function postJson(
  fetcher: FetchLike,
  url: string,
  body: unknown,
  timeoutSeconds: number,
): Promise<ProviderRecord> {
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
      signal: AbortSignal.timeout(timeoutSeconds * 1_000),
    });
  } catch {
    throw new JazzCashCpsError("The JazzCash CPS request could not reach the provider.");
  }

  if (!response.ok) {
    throw new JazzCashCpsError(`The JazzCash CPS endpoint returned HTTP ${response.status}.`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new JazzCashCpsError("The JazzCash CPS endpoint returned invalid JSON.");
  }
  const fields = responseRecord(payload);
  if (Object.keys(fields).length === 0) {
    throw new JazzCashCpsError("The JazzCash CPS endpoint returned an empty response.");
  }
  return fields;
}

function requireCpsConfig(config: ApiConfig): Readonly<{
  merchantId: string;
  password: string;
  integritySalt: string;
  statusUrl: string;
  refundUrl: string;
}> {
  if (
    !config.FEATURE_JAZZCASH_ENABLED ||
    config.JAZZCASH_MODE === "disabled" ||
    !config.JAZZCASH_MERCHANT_ID ||
    !config.JAZZCASH_PASSWORD ||
    !config.JAZZCASH_INTEGRITY_SALT ||
    !config.JAZZCASH_STATUS_URL ||
    !config.JAZZCASH_REFUND_URL
  ) {
    throw new JazzCashCpsError("The JazzCash CPS adapter is not fully configured.", false);
  }
  return {
    merchantId: config.JAZZCASH_MERCHANT_ID,
    password: config.JAZZCASH_PASSWORD,
    integritySalt: config.JAZZCASH_INTEGRITY_SALT,
    statusUrl: config.JAZZCASH_STATUS_URL,
    refundUrl: config.JAZZCASH_REFUND_URL,
  };
}

export function createJazzCashCpsClient(
  config: ApiConfig,
  fetcher: FetchLike = fetch,
): JazzCashCpsClient {
  const provider = requireCpsConfig(config);
  const timeoutSeconds = config.JAZZCASH_CPS_TIMEOUT_SECONDS ?? 15;

  return {
    inquire: async ({ merchantReference }) => {
      const fields: Record<string, string> = {
        pp_TxnRefNo: merchantReference,
        pp_MerchantID: provider.merchantId,
        pp_Password: provider.password,
        pp_Version: config.JAZZCASH_VERSION,
      };
      fields["pp_SecureHash"] = jazzCashSecureHash(fields, provider.integritySalt);
      const response = await postJson(fetcher, provider.statusUrl, fields, timeoutSeconds);
      const signatureVerified = validateResponseSignature(response, provider.integritySalt);
      if (signatureVerified === false) {
        throw new JazzCashCpsError("The JazzCash status response signature is invalid.", false);
      }
      const responseCode = pick(response, "pp_ResponseCode", "responseCode");
      return {
        operation: "status",
        responseCode,
        responseMessage: pick(response, "pp_ResponseMessage", "responseMessage"),
        providerStatus: pick(response, "status", "pp_Status", "providerStatus"),
        providerReference: pick(
          response,
          "pp_RetreivalReferenceNo",
          "pp_RetrievalReferenceNo",
          "rrn",
        ),
        signatureVerified,
        payloadDigest: canonicalDigest(response),
        accepted: responseCode === null || responseCode === "000",
      };
    },

    refund: async ({ merchantReference, amountMinor, currency }) => {
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
        throw new JazzCashCpsError("A JazzCash refund requires a positive integer amount.", false);
      }
      const fields: Record<string, string> = {
        pp_TxnRefNo: merchantReference,
        pp_Amount: String(amountMinor),
        pp_TxnCurrency: currency,
        pp_MerchantID: provider.merchantId,
        pp_Password: provider.password,
      };
      fields["pp_SecureHash"] = jazzCashSecureHash(fields, provider.integritySalt);
      const body = config.JAZZCASH_REFUND_ENVELOPE === "flat" ? fields : { RefundRequest: fields };
      const response = await postJson(fetcher, provider.refundUrl, body, timeoutSeconds);
      const signatureVerified = validateResponseSignature(response, provider.integritySalt);
      if (signatureVerified === false) {
        throw new JazzCashCpsError("The JazzCash refund response signature is invalid.", false);
      }
      const responseCode = pick(response, "pp_ResponseCode", "responseCode");
      return {
        operation: "refund",
        responseCode,
        responseMessage: pick(response, "pp_ResponseMessage", "responseMessage"),
        providerStatus: pick(response, "status", "pp_Status"),
        providerReference: pick(
          response,
          "pp_RetreivalReferenceNo",
          "pp_RetrievalReferenceNo",
          "rrn",
        ),
        signatureVerified,
        payloadDigest: canonicalDigest(response),
        accepted: responseCode === "000",
      };
    },
  };
}
