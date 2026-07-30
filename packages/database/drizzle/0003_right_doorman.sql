CREATE TABLE "challenge_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"challenge_id" uuid NOT NULL,
	"challenge_version_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"response_payload" jsonb NOT NULL,
	"status" text NOT NULL,
	"awarded_points" integer DEFAULT 0 NOT NULL,
	"max_points" integer NOT NULL,
	"explanation" text NOT NULL,
	"retry_allowed" boolean DEFAULT false NOT NULL,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_attempts_number_positive" CHECK ("challenge_attempts"."attempt_number" > 0),
	CONSTRAINT "challenge_attempts_request_hash_length" CHECK (char_length("challenge_attempts"."request_hash") = 64),
	CONSTRAINT "challenge_attempts_response_object" CHECK (jsonb_typeof("challenge_attempts"."response_payload") = 'object'),
	CONSTRAINT "challenge_attempts_status_allowed" CHECK ("challenge_attempts"."status" in ('correct', 'incorrect', 'needs_review')),
	CONSTRAINT "challenge_attempts_points_valid" CHECK ("challenge_attempts"."awarded_points" >= 0 and "challenge_attempts"."max_points" >= 0 and "challenge_attempts"."awarded_points" <= "challenge_attempts"."max_points"),
	CONSTRAINT "challenge_attempts_explanation_length" CHECK (char_length("challenge_attempts"."explanation") between 1 and 1000),
	CONSTRAINT "challenge_attempts_review_not_scored" CHECK ("challenge_attempts"."status" <> 'needs_review' or ("challenge_attempts"."awarded_points" = 0 and "challenge_attempts"."retry_allowed" = false))
);
--> statement-breakpoint
CREATE TABLE "learner_level_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"level_id" uuid NOT NULL,
	"level_version_id" uuid NOT NULL,
	"best_awarded_points" integer DEFAULT 0 NOT NULL,
	"max_points" integer NOT NULL,
	"completion_count" integer DEFAULT 0 NOT NULL,
	"last_session_id" uuid,
	"first_completed_at" timestamp with time zone,
	"last_completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learner_level_progress_points_valid" CHECK ("learner_level_progress"."best_awarded_points" >= 0 and "learner_level_progress"."max_points" >= 0 and "learner_level_progress"."best_awarded_points" <= "learner_level_progress"."max_points"),
	CONSTRAINT "learner_level_progress_count_nonnegative" CHECK ("learner_level_progress"."completion_count" >= 0),
	CONSTRAINT "learner_level_progress_completion_metadata" CHECK (("learner_level_progress"."completion_count" = 0 and "learner_level_progress"."first_completed_at" is null and "learner_level_progress"."last_completed_at" is null) or ("learner_level_progress"."completion_count" > 0 and "learner_level_progress"."first_completed_at" is not null and "learner_level_progress"."last_completed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "level_play_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"level_id" uuid NOT NULL,
	"level_version_id" uuid NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"current_challenge_ordinal" integer DEFAULT 0 NOT NULL,
	"awarded_points" integer DEFAULT 0 NOT NULL,
	"max_points" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "level_play_sessions_state_allowed" CHECK ("level_play_sessions"."state" in ('active', 'completed', 'abandoned', 'expired')),
	CONSTRAINT "level_play_sessions_challenge_ordinal_nonnegative" CHECK ("level_play_sessions"."current_challenge_ordinal" >= 0),
	CONSTRAINT "level_play_sessions_points_valid" CHECK ("level_play_sessions"."awarded_points" >= 0 and "level_play_sessions"."max_points" >= 0 and "level_play_sessions"."awarded_points" <= "level_play_sessions"."max_points"),
	CONSTRAINT "level_play_sessions_expiry_valid" CHECK ("level_play_sessions"."expires_at" > "level_play_sessions"."started_at"),
	CONSTRAINT "level_play_sessions_completion_metadata" CHECK (("level_play_sessions"."state" = 'completed' and "level_play_sessions"."completed_at" is not null) or ("level_play_sessions"."state" <> 'completed'))
);
--> statement-breakpoint
CREATE TABLE "level_session_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"challenge_id" uuid NOT NULL,
	"challenge_version_id" uuid NOT NULL,
	"max_attempts" integer DEFAULT 2 NOT NULL,
	"max_points" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "level_session_challenges_ordinal_nonnegative" CHECK ("level_session_challenges"."ordinal" >= 0),
	CONSTRAINT "level_session_challenges_attempt_range" CHECK ("level_session_challenges"."max_attempts" between 1 and 20),
	CONSTRAINT "level_session_challenges_points_range" CHECK ("level_session_challenges"."max_points" between 0 and 1000)
);
--> statement-breakpoint
ALTER TABLE "challenge_attempts" ADD CONSTRAINT "challenge_attempts_session_id_level_play_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."level_play_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_attempts" ADD CONSTRAINT "challenge_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_attempts" ADD CONSTRAINT "challenge_attempts_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_attempts" ADD CONSTRAINT "challenge_attempts_challenge_version_id_challenge_versions_id_fk" FOREIGN KEY ("challenge_version_id") REFERENCES "public"."challenge_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_level_progress" ADD CONSTRAINT "learner_level_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_level_progress" ADD CONSTRAINT "learner_level_progress_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_level_progress" ADD CONSTRAINT "learner_level_progress_level_version_id_level_versions_id_fk" FOREIGN KEY ("level_version_id") REFERENCES "public"."level_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_level_progress" ADD CONSTRAINT "learner_level_progress_last_session_id_level_play_sessions_id_fk" FOREIGN KEY ("last_session_id") REFERENCES "public"."level_play_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_play_sessions" ADD CONSTRAINT "level_play_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_play_sessions" ADD CONSTRAINT "level_play_sessions_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_play_sessions" ADD CONSTRAINT "level_play_sessions_level_version_id_level_versions_id_fk" FOREIGN KEY ("level_version_id") REFERENCES "public"."level_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_session_challenges" ADD CONSTRAINT "level_session_challenges_session_id_level_play_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."level_play_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_session_challenges" ADD CONSTRAINT "level_session_challenges_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_session_challenges" ADD CONSTRAINT "level_session_challenges_challenge_version_id_challenge_versions_id_fk" FOREIGN KEY ("challenge_version_id") REFERENCES "public"."challenge_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_attempts_idempotency_unique" ON "challenge_attempts" USING btree ("session_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_attempts_number_unique" ON "challenge_attempts" USING btree ("session_id","challenge_version_id","attempt_number");--> statement-breakpoint
CREATE INDEX "challenge_attempts_user_activity_idx" ON "challenge_attempts" USING btree ("user_id","evaluated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "learner_level_progress_version_unique" ON "learner_level_progress" USING btree ("user_id","level_version_id");--> statement-breakpoint
CREATE INDEX "learner_level_progress_user_idx" ON "learner_level_progress" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "level_play_sessions_user_activity_idx" ON "level_play_sessions" USING btree ("user_id","last_activity_at");--> statement-breakpoint
CREATE INDEX "level_play_sessions_level_version_idx" ON "level_play_sessions" USING btree ("level_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "level_session_challenges_ordinal_unique" ON "level_session_challenges" USING btree ("session_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "level_session_challenges_version_unique" ON "level_session_challenges" USING btree ("session_id","challenge_version_id");--> statement-breakpoint
CREATE INDEX "level_session_challenges_challenge_idx" ON "level_session_challenges" USING btree ("challenge_version_id");