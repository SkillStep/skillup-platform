CREATE TABLE "learning_analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_key" text NOT NULL,
	"event_name" text NOT NULL,
	"session_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"content_version_id" uuid NOT NULL,
	"content_version" integer NOT NULL,
	"locale" text NOT NULL,
	"consent" text DEFAULT 'essential-only' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_analytics_events_name_allowed" CHECK ("learning_analytics_events"."event_name" in ('level_started', 'level_completed')),
	CONSTRAINT "learning_analytics_events_key_format" CHECK ("learning_analytics_events"."event_key" ~ '^level_(started|completed):[0-9a-f-]{36}$'),
	CONSTRAINT "learning_analytics_events_content_version_positive" CHECK ("learning_analytics_events"."content_version" > 0),
	CONSTRAINT "learning_analytics_events_locale_allowed" CHECK ("learning_analytics_events"."locale" in ('en', 'ur')),
	CONSTRAINT "learning_analytics_events_consent_allowed" CHECK ("learning_analytics_events"."consent" = 'essential-only')
);
--> statement-breakpoint
ALTER TABLE "learning_analytics_events" ADD CONSTRAINT "learning_analytics_events_session_id_level_play_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."level_play_sessions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "learning_analytics_events" ADD CONSTRAINT "learning_analytics_events_content_id_levels_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."levels"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "learning_analytics_events" ADD CONSTRAINT "learning_analytics_events_content_version_id_level_versions_id_fk" FOREIGN KEY ("content_version_id") REFERENCES "public"."level_versions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "learning_analytics_events_event_key_unique" ON "learning_analytics_events" USING btree ("event_key");
--> statement-breakpoint
CREATE INDEX "learning_analytics_events_name_occurred_idx" ON "learning_analytics_events" USING btree ("event_name", "occurred_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "level_play_sessions_active_user_version_unique" ON "level_play_sessions" USING btree ("user_id", "level_version_id") WHERE "state" = 'active';
--> statement-breakpoint
CREATE TRIGGER "learning_analytics_events_append_only_trigger"
BEFORE UPDATE OR DELETE ON "learning_analytics_events"
FOR EACH ROW
EXECUTE FUNCTION "skillup_reject_progress_event_mutation"();
