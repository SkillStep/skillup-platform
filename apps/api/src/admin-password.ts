import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import type { Pool } from "pg";

const scrypt = promisify(scryptCallback);

const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_BYTES = 16;

export function normalizeAdminEmail(email: string): string {
  return email.trim().toLocaleLowerCase("en-US");
}

export async function hashAdminPassword(
  password: string,
  salt?: Buffer,
): Promise<
  Readonly<{
    salt: string;
    hash: string;
    algorithm: "scrypt";
  }>
> {
  const saltBuffer = salt ?? randomBytes(SCRYPT_SALT_BYTES);
  const derived = (await scrypt(password, saltBuffer, SCRYPT_KEYLEN)) as Buffer;
  return {
    salt: saltBuffer.toString("base64url"),
    hash: derived.toString("base64url"),
    algorithm: "scrypt",
  };
}

export async function verifyAdminPassword(
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

export async function upsertAdminPasswordCredential(
  pool: Pool,
  input: Readonly<{ userId: string; password: string }>,
): Promise<void> {
  const hashed = await hashAdminPassword(input.password);
  await pool.query(
    `insert into admin_password_credentials (user_id, password_hash, password_salt, algorithm, created_at, updated_at)
     values ($1, $2, $3, $4, now(), now())
     on conflict (user_id) do update
       set password_hash = excluded.password_hash,
           password_salt = excluded.password_salt,
           algorithm = excluded.algorithm,
           updated_at = now()`,
    [input.userId, hashed.hash, hashed.salt, hashed.algorithm],
  );
}

export async function loadAdminPasswordCredential(
  pool: Pool,
  emailNormalized: string,
): Promise<Readonly<{
  userId: string;
  salt: string;
  hash: string;
  algorithm: string;
}> | null> {
  const result = await pool.query<{
    user_id: string;
    password_hash: string;
    password_salt: string;
    algorithm: string;
  }>(
    `select c.user_id, c.password_hash, c.password_salt, c.algorithm
       from admin_password_credentials c
       join users u on u.id = c.user_id
       join user_email_identities e on e.user_id = u.id
       join admin_principals p on p.user_id = u.id
      where e.email_normalized = $1
        and e.verified_at is not null
        and u.status = 'active'
        and p.status = 'active'
      limit 1`,
    [emailNormalized],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    userId: row.user_id,
    salt: row.password_salt,
    hash: row.password_hash,
    algorithm: row.algorithm,
  };
}
