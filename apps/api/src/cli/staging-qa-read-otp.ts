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

async function main(): Promise<void> {
  if (process.env["APP_ENV"] !== "staging") {
    throw new Error("Staging QA OTP recovery is allowed only when APP_ENV=staging.");
  }
  if (process.env["STAGING_QA_OTP_READ_CONFIRM"] !== CONFIRMATION) {
    throw new Error("The staging QA OTP recovery confirmation is missing or invalid.");
  }

  const email = normalizeStagingQaEmail(required("STAGING_QA_OTP_EMAIL"));
  if (!isAllowedStagingQaEmail(email)) {
    throw new Error("The requested address is not an approved SkillUp staging QA identity.");
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
        where email_normalized = $1
          and purpose = 'sign_in'
          and created_at >= $2
          and consumed_at is null
          and attempts_remaining > 0
          and expires_at > now()
        order by created_at desc
        limit 5`,
      [email, after],
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
