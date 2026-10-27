import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import type { Pool } from "pg";

const scrypt = promisify(scryptCallback);

const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_BYTES = 16;

/** Default password assigned to existing OTP-era phone learners. */
export const LEARNER_MIGRATION_PASSWORD = "Abc@123";

/** Matches Abc@123-style passwords: 7+ chars with upper, lower, digit, and symbol. */
export function isValidLearnerPassword(password: string): boolean {
  return (
    password.length >= 7 &&
    password.length <= 128 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

export async function hashLearnerPassword(
  password: string,
  salt?: Buffer,
): Promise<Readonly<{ salt: string; hash: string; algorithm: "scrypt" }>> {
  const saltBuffer = salt ?? randomBytes(SCRYPT_SALT_BYTES);
  const derived = (await scrypt(password, saltBuffer, SCRYPT_KEYLEN)) as Buffer;
  return {
    salt: saltBuffer.toString("base64url"),
    hash: derived.toString("base64url"),
    algorithm: "scrypt",
  };
}

export async function verifyLearnerPassword(
  password: string,
  stored: Readonly<{ salt: string; hash: string; algorithm: string }>,
): Promise<boolean> {
  if (stored.algorithm !== "scrypt") return false;
  try {
    const saltBuffer = Buffer.from(stored.salt, "base64url");
    const expected = Buffer.from(stored.hash, "base64url");
    const actual = (await scrypt(password, saltBuffer, expected.length)) as Buffer;
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function upsertLearnerPasswordCredential(
  pool: Pool,
  input: Readonly<{ userId: string; password: string }>,
): Promise<void> {
  const hashed = await hashLearnerPassword(input.password);
  await pool.query(
    `insert into learner_password_credentials (user_id, password_hash, password_salt, algorithm, created_at, updated_at)
     values ($1, $2, $3, $4, now(), now())
     on conflict (user_id) do update
       set password_hash = excluded.password_hash,
           password_salt = excluded.password_salt,
           algorithm = excluded.algorithm,
           updated_at = now()`,
    [input.userId, hashed.hash, hashed.salt, hashed.algorithm],
  );
}

export async function loadLearnerPasswordCredential(
  pool: Pool,
  userId: string,
): Promise<Readonly<{ salt: string; hash: string; algorithm: string }> | null> {
  const result = await pool.query<{
    password_hash: string;
    password_salt: string;
    algorithm: string;
  }>(
    `select password_hash, password_salt, algorithm
       from learner_password_credentials
      where user_id = $1
      limit 1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    salt: row.password_salt,
    hash: row.password_hash,
    algorithm: row.algorithm,
  };
}

/**
 * Idempotently assign the migration password to phone learners who still have no password.
 * Safe to run on every API boot.
 */
export async function ensureLearnerMigrationPasswords(pool: Pool): Promise<number> {
  const users = await pool.query<{ user_id: string }>(
    `select ph.user_id
       from user_phone_identities ph
       join users u on u.id = ph.user_id
       left join learner_password_credentials c on c.user_id = ph.user_id
      where u.status = 'active'
        and c.user_id is null`,
  );

  let updated = 0;
  for (const row of users.rows) {
    await upsertLearnerPasswordCredential(pool, {
      userId: row.user_id,
      password: LEARNER_MIGRATION_PASSWORD,
    });
    updated += 1;
  }
  return updated;
}
