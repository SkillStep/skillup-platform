CREATE TABLE "auth_challenges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email_normalized" text NOT NULL,
	"purpose" text DEFAULT 'sign_in' NOT NULL,
	"secret_digest" text NOT NULL,
	"request_fingerprint_digest" text NOT NULL,
	"attempts_remaining" integer DEFAULT 5 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_challenges_purpose_allowed" CHECK ("auth_challenges"."purpose" in ('sign_in')),
	CONSTRAINT "auth_challenges_attempts_range" CHECK ("auth_challenges"."attempts_remaining" between 0 and 5),
	CONSTRAINT "auth_challenges_secret_digest_length" CHECK (char_length("auth_challenges"."secret_digest") = 64),
	CONSTRAINT "auth_challenges_fingerprint_digest_length" CHECK (char_length("auth_challenges"."request_fingerprint_digest") = 64),
	CONSTRAINT "auth_challenges_expiry_after_creation" CHECK ("auth_challenges"."expires_at" > "auth_challenges"."created_at")
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_digest" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_token_digest_length" CHECK (char_length("auth_sessions"."token_digest") = 64),
	CONSTRAINT "auth_sessions_absolute_expiry_after_creation" CHECK ("auth_sessions"."expires_at" > "auth_sessions"."created_at"),
	CONSTRAINT "auth_sessions_idle_expiry_after_creation" CHECK ("auth_sessions"."idle_expires_at" > "auth_sessions"."created_at")
);
--> statement-breakpoint
CREATE TABLE "learner_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"age_band" text DEFAULT 'unspecified' NOT NULL,
	"avatar_key" text,
	"learning_goal" text,
	"onboarding_status" text DEFAULT 'not_started' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learner_profiles_locale_allowed" CHECK ("learner_profiles"."locale" in ('en', 'ur')),
	CONSTRAINT "learner_profiles_age_band_allowed" CHECK ("learner_profiles"."age_band" in ('16_17', '18_24', '25_34', '35_plus', 'unspecified')),
	CONSTRAINT "learner_profiles_onboarding_status_allowed" CHECK ("learner_profiles"."onboarding_status" in ('not_started', 'in_progress', 'completed')),
	CONSTRAINT "learner_profiles_display_name_length" CHECK ("learner_profiles"."display_name" is null or char_length("learner_profiles"."display_name") between 2 and 60),
	CONSTRAINT "learner_profiles_learning_goal_length" CHECK ("learner_profiles"."learning_goal" is null or char_length("learner_profiles"."learning_goal") between 3 and 240),
	CONSTRAINT "learner_profiles_avatar_key_format" CHECK ("learner_profiles"."avatar_key" is null or "learner_profiles"."avatar_key" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "user_email_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email_normalized" text NOT NULL,
	"email_display" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_identities_normalized_email" CHECK ("user_email_identities"."email_normalized" = lower(btrim("user_email_identities"."email_normalized"))),
	CONSTRAINT "user_email_identities_email_length" CHECK (char_length("user_email_identities"."email_normalized") between 3 and 254)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deletion_requested_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_status_allowed" CHECK ("users"."status" in ('active', 'deletion_requested', 'deleted'))
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_profiles" ADD CONSTRAINT "learner_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_email_identities" ADD CONSTRAINT "user_email_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_challenges_email_created_idx" ON "auth_challenges" USING btree ("email_normalized","created_at");--> statement-breakpoint
CREATE INDEX "auth_challenges_fingerprint_created_idx" ON "auth_challenges" USING btree ("request_fingerprint_digest","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_digest_unique" ON "auth_sessions" USING btree ("token_digest");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_identities_email_unique" ON "user_email_identities" USING btree ("email_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_identities_user_unique" ON "user_email_identities" USING btree ("user_id");