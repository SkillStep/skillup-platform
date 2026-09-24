import { z } from "zod";

export type SignInIdentity =
  | Readonly<{ channel: "email"; normalized: string; display: string }>
  | Readonly<{ channel: "sms"; normalized: string; display: string }>;

const EmailSchema = z.string().trim().email().max(254);

export function normalizePakistanPhone(value: string): string | null {
  const compact = value.trim().replace(/[\s()-]/g, "");
  let national: string;
  if (/^\+923\d{9}$/.test(compact)) national = compact.slice(3);
  else if (/^00923\d{9}$/.test(compact)) national = compact.slice(4);
  else if (/^923\d{9}$/.test(compact)) national = compact.slice(2);
  else if (/^03\d{9}$/.test(compact)) national = compact.slice(1);
  else if (/^3\d{9}$/.test(compact)) national = compact;
  else return null;
  return `+92${national}`;
}

export function formatPakistanPhone(e164: string): string {
  const match = /^\+92(3\d{2})(\d{7})$/.exec(e164);
  if (!match) return e164;
  return `0${match[1]} ${match[2]?.slice(0, 3)} ${match[2]?.slice(3)}`;
}

export function parseSignInIdentity(value: string): SignInIdentity {
  const raw = value.trim();
  if (raw.includes("@")) {
    const email = EmailSchema.parse(raw).toLocaleLowerCase("en-US");
    return { channel: "email", normalized: email, display: email };
  }
  const phone = normalizePakistanPhone(raw);
  if (!phone) {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["identity"],
        message: "Enter a valid email address or Pakistani mobile number.",
      },
    ]);
  }
  return { channel: "sms", normalized: phone, display: formatPakistanPhone(phone) };
}

export function maskIdentity(identity: SignInIdentity): string {
  if (identity.channel === "sms") {
    return identity.normalized.replace(/^(\+923\d{2})\d{4}(\d{3})$/, "$1 **** $2");
  }
  const [local = "", domain = ""] = identity.normalized.split("@");
  const visible = local.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(3, Math.min(8, local.length - 1)))}@${domain}`;
}
