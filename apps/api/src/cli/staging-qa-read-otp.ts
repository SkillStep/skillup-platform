import { Pool } from "pg";

import {
  isAllowedStagingQaEmail,
  normalizeStagingQaEmail,
  parseStagingQaAfter,
  recoverStagingQaOtp,
} from "../staging-qa-otp-reader.js";

const CONFIRMATION = "I_UNDERSTAND_THIS_READS_STAGING_QA_OTP_EVIDENCE";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for staging QA OTP recovery.`);
  return value;
}

function normalizePhone(value: string): string {
  const compact = value.trim().replace(/[\s()-]/g, "");
  if (/^\+923\d{9}$/.test(compact)) return compact;
  if (/^03\d{9}$/.test(compact)) return `+92${compact.slice(1)}`;
  throw new Error("STAGING_QA_OTP_PHONE must be a valid Pakistani mobile number.");
}

async function main(): Promise<void> {
  if (process.env["APP_ENV"] !== "staging") {
    throw new Error("Staging QA OTP recovery is allowed only when APP_ENV=staging.");
  }
  if (process.env["STAGING_QA_OTP_READ_CONFIRM"] !== CONFIRMATION) {
    throw new Error("The staging QA OTP recovery confirmation is missing or invalid.");
  }

  const emailInput = process.env["STAGING_QA_OTP_EMAIL"]?.trim();
  const phoneInput = process.env["STAGING_QA_OTP_PHONE"]?.trim();
  if (Boolean(emailInput) === Boolean(phoneInput)) {
    throw new Error("Exactly one staging QA OTP identity must be supplied.");
  }

  let identityType: "email" | "phone";
  let identityNormalized: string;
  if (emailInput) {
    const email = normalizeStagingQaEmail(emailInput);
    if (!isAllowedStagingQaEmail(email)) {
      throw new Error("The requested address is not an approved SkillUp staging QA identity.");
    }
    identityType = "email";
    identityNormalized = email;
  } else {
    identityType = "phone";
    identityNormalized = normalizePhone(required("STAGING_QA_OTP_PHONE"));
    const allowedPhone = process.env["STAGING_QA_PHONE"]?.trim();
    if (!allowedPhone || normalizePhone(allowedPhone) !== identityNormalized) {
      throw new Error("The requested phone is not the approved SkillUp staging QA identity.");
    }
  }

  const after = parseStagingQaAfter(required("STAGING_QA_OTP_AFTER"));
  const databaseUrl = required("DATABASE_URL");
  const sessionSecret = required("SESSION_SECRET");
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });

  try {
    const result = await pool.query<{
      id: string;
      secret_digest: string;
      created_at: Date;
    }>(
      `select id, secret_digest, created_at
         from auth_challenges
        where identity_type = $1
          and identity_normalized = $2
          and purpose = 'sign_in'
          and created_at >= $3
          and consumed_at is null
          and attempts_remaining > 0
          and expires_at > now()
        order by created_at desc
        limit 5`,
      [identityType, identityNormalized, after],
    );

    for (const challenge of result.rows) {
      const code = recoverStagingQaOtp(sessionSecret, challenge.id, challenge.secret_digest);
      if (!code) continue;
      process.stdout.write(
        `${JSON.stringify({ code, challengeId: challenge.id, createdAt: challenge.created_at.toISOString() })}\n`,
      );
      return;
    }

    process.exitCode = 4;
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown staging QA OTP recovery failure.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
