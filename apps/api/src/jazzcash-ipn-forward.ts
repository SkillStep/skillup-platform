export type ForwardedIpn =
  | { disposition: "applied"; body: unknown }
  | { disposition: "invalid_hash"; body: unknown }
  | { disposition: "unknown" }
  | { disposition: "unavailable" };

export type IpnAck = Readonly<{
  statusCode: number;
  body: unknown;
}>;

export type WalletReturnAck = IpnAck;

type FetchLike = typeof fetch;

function callbackUrl(baseUrl: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("v1/api/callback", base).toString();
}

function isUnknownOrder(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "statusCode" in error &&
      (error as { statusCode?: unknown }).statusCode === 404,
  );
}

export async function postJazzCashIpn(
  baseUrl: string,
  timeoutSeconds: number,
  fields: Readonly<Record<string, string>>,
  fetcher: FetchLike = fetch,
): Promise<ForwardedIpn> {
  let response: Response;
  try {
    response = await fetcher(callbackUrl(baseUrl), {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(fields),
      redirect: "error",
      signal: AbortSignal.timeout(timeoutSeconds * 1_000),
    });
  } catch {
    return { disposition: "unavailable" };
  }

  const body = (await response.json().catch(() => null)) as unknown;
  if (response.status === 400) return { disposition: "invalid_hash", body };
  if (!response.ok) return { disposition: "unavailable" };
  const record =
    body && typeof body === "object" ? (body as { kind?: unknown; outcome?: unknown }) : {};
  if (record.kind === "ignored" || record.outcome === "unknown") return { disposition: "unknown" };
  return { disposition: "applied", body };
}

/**
 * JazzCash posts the wallet-link result to SkillUp's registered return URL.
 * SkillUp forwards those original fields; the payment service stores the token,
 * opens the subscription, and queues the first charge.
 */
export function acknowledgeExternalWalletReturn(
  forwarded: ForwardedIpn,
  requestId: string,
): WalletReturnAck {
  if (forwarded.disposition === "invalid_hash") {
    return {
      statusCode: 400,
      body: { message: "The JazzCash wallet-link response signature is invalid." },
    };
  }
  if (forwarded.disposition === "unavailable") {
    return {
      statusCode: 502,
      body: { message: "The payment service could not be reached." },
    };
  }
  if (forwarded.disposition === "unknown") {
    return {
      statusCode: 404,
      body: { message: "The wallet-link request was not found." },
    };
  }
  const outcome =
    forwarded.body && typeof forwarded.body === "object" && "outcome" in forwarded.body
      ? String((forwarded.body as { outcome?: unknown }).outcome ?? "")
      : "";
  if (outcome === "failed") {
    return {
      statusCode: 402,
      body: {
        error: "jazzcash_wallet_link_failed",
        message: "JazzCash wallet linking failed. No Premium entitlement was granted.",
      },
    };
  }
  return {
    statusCode: 201,
    body: {
      checkoutMode: "jazzcash_wallet_link",
      order: { id: requestId, status: "pending" },
    },
  };
}

export async function acknowledgeJazzCashIpn(input: {
  fields: Readonly<Record<string, string>>;
  forward?: (fields: Readonly<Record<string, string>>) => Promise<ForwardedIpn>;
  settleLocal: (fields: Readonly<Record<string, string>>) => Promise<{
    merchantReference: string;
    status: string;
  }>;
}): Promise<IpnAck> {
  let forwarded: ForwardedIpn | null = null;
  if (input.forward) {
    forwarded = await input.forward(input.fields);
    if (forwarded.disposition === "invalid_hash") {
      return {
        statusCode: 400,
        body: forwarded.body ?? { received: false, status: "invalid_hash" },
      };
    }
    if (forwarded.disposition === "applied") {
      return {
        statusCode: 200,
        body: forwarded.body ?? { received: true, status: "forwarded" },
      };
    }
  }

  try {
    const order = await input.settleLocal(input.fields);
    return {
      statusCode: 200,
      body: {
        received: true,
        merchantReference: order.merchantReference,
        status: order.status,
      },
    };
  } catch (error) {
    if (!isUnknownOrder(error)) throw error;
    if (forwarded?.disposition === "unavailable") {
      return { statusCode: 502, body: { received: false, status: "payment_service_unavailable" } };
    }
    return { statusCode: 200, body: { received: true, status: "ignored_unknown" } };
  }
}
