CREATE TABLE "learner_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"level_id" uuid NOT NULL,
	"state" text DEFAULT 'enrolled' NOT NULL,
	"last_session_id" uuid,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learner_enrollments_state_allowed" CHECK ("learner_enrollments"."state" in ('enrolled', 'in_progress', 'completed', 'paused')),
	CONSTRAINT "learner_enrollments_completion_metadata" CHECK (("learner_enrollments"."state" = 'completed' and "learner_enrollments"."completed_at" is not null) or ("learner_enrollments"."state" <> 'completed'))
);
--> statement-breakpoint
CREATE TABLE "learner_progress_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"tier" text DEFAULT 'free' NOT NULL,
	"leaderboard_opt_in" boolean DEFAULT false NOT NULL,
	"leaderboard_alias" text,
	"leaderboard_status" text DEFAULT 'eligible' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learner_progress_settings_timezone_length" CHECK (char_length("learner_progress_settings"."timezone") between 3 and 64),
	CONSTRAINT "learner_progress_settings_timezone_format" CHECK ("learner_progress_settings"."timezone" ~ '^[A-Za-z0-9_+./-]+$'),
	CONSTRAINT "learner_progress_settings_tier_allowed" CHECK ("learner_progress_settings"."tier" in ('free', 'premium')),
	CONSTRAINT "learner_progress_settings_leaderboard_status_allowed" CHECK ("learner_progress_settings"."leaderboard_status" in ('eligible', 'suspended')),
	CONSTRAINT "learner_progress_settings_alias_format" CHECK ("learner_progress_settings"."leaderboard_alias" is null or "learner_progress_settings"."leaderboard_alias" ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,23}$'),
	CONSTRAINT "learner_progress_settings_opt_in_alias" CHECK ("learner_progress_settings"."leaderboard_opt_in" = false or "learner_progress_settings"."leaderboard_alias" is not null)
);
--> statement-breakpoint
CREATE TABLE "points_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid,
	"points_delta" integer NOT NULL,
	"reason_code" text NOT NULL,
	"explanation" text NOT NULL,
	"correction_of_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "points_ledger_source_type_allowed" CHECK ("points_ledger"."source_type" in ('level_completion', 'badge', 'manual_adjustment', 'correction')),
	CONSTRAINT "points_ledger_delta_range" CHECK ("points_ledger"."points_delta" between -100000 and 100000 and "points_ledger"."points_delta" <> 0),
	CONSTRAINT "points_ledger_event_key_length" CHECK (char_length("points_ledger"."event_key") between 8 and 180),
	CONSTRAINT "points_ledger_reason_code_format" CHECK ("points_ledger"."reason_code" ~ '^[a-z0-9_]{3,60}$'),
	CONSTRAINT "points_ledger_explanation_length" CHECK (char_length("points_ledger"."explanation") between 3 and 500),
	CONSTRAINT "points_ledger_correction_metadata" CHECK (("points_ledger"."source_type" = 'correction' and "points_ledger"."correction_of_id" is not null) or ("points_ledger"."source_type" <> 'correction' and "points_ledger"."correction_of_id" is null))
);
--> statement-breakpoint
CREATE TABLE "learner_streaks" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"current_days" integer DEFAULT 0 NOT NULL,
	"longest_days" integer DEFAULT 0 NOT NULL,
	"last_qualified_date" date,
	"grace_credits" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learner_streaks_timezone_length" CHECK (char_length("learner_streaks"."timezone") between 3 and 64),
	CONSTRAINT "learner_streaks_counts_valid" CHECK ("learner_streaks"."current_days" >= 0 and "learner_streaks"."longest_days" >= "learner_streaks"."current_days" and "learner_streaks"."grace_credits" between 0 and 3),
	CONSTRAINT "learner_streaks_date_metadata" CHECK (("learner_streaks"."current_days" = 0 and "learner_streaks"."last_qualified_date" is null) or ("learner_streaks"."current_days" > 0 and "learner_streaks"."last_qualified_date" is not null))
);
--> statement-breakpoint
CREATE TABLE "streak_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"event_type" text NOT NULL,
	"source_id" uuid,
	"local_date" date NOT NULL,
	"timezone" text NOT NULL,
	"explanation" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "streak_events_type_allowed" CHECK ("streak_events"."event_type" in ('qualified', 'grace', 'correction')),
	CONSTRAINT "streak_events_timezone_length" CHECK (char_length("streak_events"."timezone") between 3 and 64),
	CONSTRAINT "streak_events_explanation_length" CHECK (char_length("streak_events"."explanation") between 3 and 500)
);
--> statement-breakpoint
CREATE TABLE "badge_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"rule_kind" text NOT NULL,
	"threshold" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "badge_definitions_key_format" CHECK ("badge_definitions"."key" ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
	CONSTRAINT "badge_definitions_state_allowed" CHECK ("badge_definitions"."state" in ('active', 'retired')),
	CONSTRAINT "badge_definitions_rule_allowed" CHECK ("badge_definitions"."rule_kind" in ('first_level', 'perfect_level', 'streak_days', 'points_total')),
	CONSTRAINT "badge_definitions_threshold_positive" CHECK ("badge_definitions"."threshold" > 0),
	CONSTRAINT "badge_definitions_title_length" CHECK (char_length("badge_definitions"."title") between 3 and 80),
	CONSTRAINT "badge_definitions_description_length" CHECK (char_length("badge_definitions"."description") between 10 and 300)
);
--> statement-breakpoint
CREATE TABLE "learner_badge_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"badge_definition_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"action" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"explanation" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learner_badge_events_action_allowed" CHECK ("learner_badge_events"."action" in ('unlocked', 'revoked', 'corrected')),
	CONSTRAINT "learner_badge_events_evidence_object" CHECK (jsonb_typeof("learner_badge_events"."evidence") = 'object'),
	CONSTRAINT "learner_badge_events_explanation_length" CHECK (char_length("learner_badge_events"."explanation") between 3 and 500)
);
--> statement-breakpoint
ALTER TABLE "learner_enrollments" ADD CONSTRAINT "learner_enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_enrollments" ADD CONSTRAINT "learner_enrollments_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_enrollments" ADD CONSTRAINT "learner_enrollments_last_session_id_level_play_sessions_id_fk" FOREIGN KEY ("last_session_id") REFERENCES "public"."level_play_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_progress_settings" ADD CONSTRAINT "learner_progress_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_correction_of_id_points_ledger_id_fk" FOREIGN KEY ("correction_of_id") REFERENCES "public"."points_ledger"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_streaks" ADD CONSTRAINT "learner_streaks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streak_events" ADD CONSTRAINT "streak_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badge_definitions" ADD CONSTRAINT "badge_definitions_noop" CHECK (true);--> statement-breakpoint
ALTER TABLE "learner_badge_events" ADD CONSTRAINT "learner_badge_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_badge_events" ADD CONSTRAINT "learner_badge_events_badge_definition_id_badge_definitions_id_fk" FOREIGN KEY ("badge_definition_id") REFERENCES "public"."badge_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "learner_enrollments_user_level_unique" ON "learner_enrollments" USING btree ("user_id","level_id");--> statement-breakpoint
CREATE INDEX "learner_enrollments_user_state_idx" ON "learner_enrollments" USING btree ("user_id","state","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "learner_progress_settings_alias_unique" ON "learner_progress_settings" USING btree ("leaderboard_alias");--> statement-breakpoint
CREATE UNIQUE INDEX "points_ledger_event_key_unique" ON "points_ledger" USING btree ("event_key");--> statement-breakpoint
CREATE INDEX "points_ledger_user_occurred_idx" ON "points_ledger" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "points_ledger_source_idx" ON "points_ledger" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "streak_events_event_key_unique" ON "streak_events" USING btree ("event_key");--> statement-breakpoint
CREATE INDEX "streak_events_user_date_idx" ON "streak_events" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "badge_definitions_key_unique" ON "badge_definitions" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "learner_badge_events_event_key_unique" ON "learner_badge_events" USING btree ("event_key");--> statement-breakpoint
CREATE INDEX "learner_badge_events_user_badge_idx" ON "learner_badge_events" USING btree ("user_id","badge_definition_id","occurred_at");--> statement-breakpoint
INSERT INTO "badge_definitions" ("id", "key", "title", "description", "rule_kind", "threshold") VALUES
	('10000000-0000-4000-8000-000000000001', 'first_steps', 'First Steps', 'Complete your first published SkillUp level.', 'first_level', 1),
	('10000000-0000-4000-8000-000000000002', 'perfect_practice', 'Perfect Practice', 'Earn every available point in a published level.', 'perfect_level', 1),
	('10000000-0000-4000-8000-000000000003', 'three_day_rhythm', 'Three-Day Rhythm', 'Qualify for learning activity across three consecutive local days.', 'streak_days', 3),
	('10000000-0000-4000-8000-000000000004', 'hundred_points', 'Hundred Points', 'Reach one hundred verified points in the append-only ledger.', 'points_total', 100)
ON CONFLICT ("key") DO NOTHING;
