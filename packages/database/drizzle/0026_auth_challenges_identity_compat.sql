-- Compat for staging auth_challenges drift: support email OTP alongside identity_* columns.

ALTER TABLE auth_challenges ADD COLUMN IF NOT EXISTS email_normalized text;
ALTER TABLE auth_challenges ADD COLUMN IF NOT EXISTS identity_type text;
ALTER TABLE auth_challenges ADD COLUMN IF NOT EXISTS identity_normalized text;
ALTER TABLE auth_challenges ADD COLUMN IF NOT EXISTS identity_display text;
ALTER TABLE auth_challenges ADD COLUMN IF NOT EXISTS user_id uuid;

-- email OTP inserts email_normalized (+ identity_*). Make drifted NOT NULL constraints nullable.
ALTER TABLE auth_challenges ALTER COLUMN identity_type DROP NOT NULL;
ALTER TABLE auth_challenges ALTER COLUMN identity_normalized DROP NOT NULL;
ALTER TABLE auth_challenges ALTER COLUMN identity_display DROP NOT NULL;
ALTER TABLE auth_challenges ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE auth_challenges ALTER COLUMN identity_type SET DEFAULT 'email';

UPDATE auth_challenges
   SET identity_type = COALESCE(identity_type, 'email')
 WHERE identity_type IS NULL;

UPDATE auth_challenges
   SET identity_normalized = COALESCE(identity_normalized, email_normalized)
 WHERE identity_normalized IS NULL;

UPDATE auth_challenges
   SET identity_display = COALESCE(identity_display, email_normalized, identity_normalized)
 WHERE identity_display IS NULL;

UPDATE auth_challenges
   SET email_normalized = identity_normalized
 WHERE (email_normalized IS NULL OR btrim(email_normalized) = '')
   AND identity_normalized IS NOT NULL
   AND btrim(identity_normalized) <> '';

UPDATE auth_challenges
   SET email_normalized = ''
 WHERE email_normalized IS NULL;

ALTER TABLE auth_challenges ALTER COLUMN email_normalized SET NOT NULL;
