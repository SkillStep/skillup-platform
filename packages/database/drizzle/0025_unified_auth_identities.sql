CREATE TABLE "user_phone_identities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "phone_normalized" text NOT NULL,
  "phone_display" text NOT NULL,
  "verified_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_phone_identities_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "user_phone_identities_normalized_phone"
    CHECK ("user_phone_identities"."phone_normalized" ~ '^\+923[0-9]{9}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_phone_identities_phone_unique"
  ON "user_phone_identities" USING btree ("phone_normalized");
--> statement-breakpoint
CREATE UNIQUE INDEX "user_phone_identities_user_unique"
  ON "user_phone_identities" USING btree ("user_id");
--> statement-breakpoint

ALTER TABLE "auth_challenges" ADD COLUMN "identity_type" text;
--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD COLUMN "identity_normalized" text;
--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD COLUMN "identity_display" text;
--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD COLUMN "user_id" uuid;
--> statement-breakpoint

UPDATE "auth_challenges"
SET
  "identity_type" = 'email',
  "identity_normalized" = "email_normalized",
  "identity_display" = "email_normalized"
WHERE "identity_type" IS NULL;
--> statement-breakpoint

ALTER TABLE "auth_challenges" ALTER COLUMN "identity_type" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "auth_challenges" ALTER COLUMN "identity_normalized" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "auth_challenges" ALTER COLUMN "identity_display" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "auth_challenges"
  ADD CONSTRAINT "auth_challenges_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

DROP INDEX IF EXISTS "auth_challenges_email_created_idx";
--> statement-breakpoint
CREATE INDEX "auth_challenges_identity_created_idx"
  ON "auth_challenges" USING btree ("identity_type","identity_normalized","created_at");
--> statement-breakpoint

ALTER TABLE "auth_challenges" DROP CONSTRAINT IF EXISTS "auth_challenges_purpose_allowed";
--> statement-breakpoint
ALTER TABLE "auth_challenges"
  ADD CONSTRAINT "auth_challenges_identity_type_allowed"
  CHECK ("auth_challenges"."identity_type" in ('email', 'phone'));
--> statement-breakpoint
ALTER TABLE "auth_challenges"
  ADD CONSTRAINT "auth_challenges_identity_normalized"
  CHECK (
    ("auth_challenges"."identity_type" = 'email'
      AND "auth_challenges"."identity_normalized" = lower(btrim("auth_challenges"."identity_normalized")))
    OR
    ("auth_challenges"."identity_type" = 'phone'
      AND "auth_challenges"."identity_normalized" ~ '^\+923[0-9]{9}$')
  );
--> statement-breakpoint
ALTER TABLE "auth_challenges"
  ADD CONSTRAINT "auth_challenges_purpose_allowed"
  CHECK ("auth_challenges"."purpose" in ('sign_in', 'link_identity'));
--> statement-breakpoint
ALTER TABLE "auth_challenges"
  ADD CONSTRAINT "auth_challenges_link_user_required"
  CHECK (
    ("auth_challenges"."purpose" = 'sign_in' AND "auth_challenges"."user_id" IS NULL)
    OR
    ("auth_challenges"."purpose" = 'link_identity' AND "auth_challenges"."user_id" IS NOT NULL)
  );
--> statement-breakpoint

ALTER TABLE "auth_challenges" DROP COLUMN "email_normalized";
