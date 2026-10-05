-- Drop legacy email_normalized after unified identity columns exist.
-- Current API inserts identity_* only; a leftover NOT NULL email_normalized causes OTP start 500.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'auth_challenges' AND column_name = 'identity_normalized'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'auth_challenges' AND column_name = 'email_normalized'
  ) THEN
    UPDATE public.auth_challenges
       SET identity_type = COALESCE(identity_type, 'email'),
           identity_normalized = COALESCE(NULLIF(identity_normalized, ''), email_normalized),
           identity_display = COALESCE(NULLIF(identity_display, ''), email_normalized)
     WHERE email_normalized IS NOT NULL;

    ALTER TABLE public.auth_challenges DROP COLUMN email_normalized;
  END IF;
END $$;
