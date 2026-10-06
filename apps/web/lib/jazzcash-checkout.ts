export type JazzCashLinkStartResponse = Readonly<{
  actionUrl?: string;
  fields?: Readonly<Record<string, string>>;
  checkoutMode?: string;
}>;

export type BillingErrorBody = Readonly<{
  error?: string;
  message?: string;
}>;

export function newCheckoutIdempotencyKey(planCode: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${planCode}-${crypto.randomUUID()}`;
  }
  return `${planCode}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function postHostedJazzCashForm(
  actionUrl: string,
  fields: Readonly<Record<string, string>>,
): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = actionUrl;
  form.acceptCharset = "UTF-8";
  form.style.display = "none";
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  // Synchronous navigation handoff to JazzCash; do not remove or re-render before submit finishes.
  form.submit();
}

export async function readBillingError(response: Response): Promise<BillingErrorBody> {
  try {
    return (await response.json()) as BillingErrorBody;
  } catch {
    return {};
  }
}

export function isValidJazzCashMsisdn(value: string): boolean {
  return /^\d{11,15}$/.test(value);
}

export const LANDING_MSISDN_STORAGE_KEY = "skillup.landing.msisdn";
