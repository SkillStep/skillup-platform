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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "skillup_record_learning_analytics_event"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	analytics_name text;
	analytics_occurred_at timestamp with time zone;
	version_number integer;
	version_locale text;
BEGIN
	IF TG_OP = 'INSERT' THEN
		analytics_name := 'level_started';
		analytics_occurred_at := NEW."started_at";
	ELSIF TG_OP = 'UPDATE' AND NEW."state" = 'completed' AND OLD."state" <> 'completed' THEN
		analytics_name := 'level_completed';
		analytics_occurred_at := NEW."completed_at";
	ELSE
		RETURN NEW;
	END IF;

	SELECT "version", "locale"
		INTO version_number, version_locale
		FROM "level_versions"
		WHERE "id" = NEW."level_version_id";

	IF version_number IS NULL OR version_locale IS NULL OR analytics_occurred_at IS NULL THEN
		RAISE EXCEPTION 'Published level analytics metadata is incomplete'
			USING ERRCODE = '23514';
	END IF;

	INSERT INTO "learning_analytics_events"
		("event_key", "event_name", "session_id", "content_id", "content_version_id",
		 "content_version", "locale", "consent", "occurred_at")
	VALUES
		(
			analytics_name || ':' || NEW."id"::text,
			analytics_name,
			NEW."id",
			NEW."level_id",
			NEW."level_version_id",
			version_number,
			version_locale,
			'essential-only',
			analytics_occurred_at
		)
	ON CONFLICT ("event_key") DO NOTHING;

	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "level_play_sessions_learning_analytics_trigger"
AFTER INSERT OR UPDATE ON "level_play_sessions"
FOR EACH ROW
EXECUTE FUNCTION "skillup_record_learning_analytics_event"();
