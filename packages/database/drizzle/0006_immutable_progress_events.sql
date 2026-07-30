CREATE OR REPLACE FUNCTION "skillup_reject_progress_event_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; record a correction or revocation event instead', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "points_ledger_append_only_trigger"
BEFORE UPDATE OR DELETE ON "points_ledger"
FOR EACH ROW
EXECUTE FUNCTION "skillup_reject_progress_event_mutation"();
--> statement-breakpoint
CREATE TRIGGER "streak_events_append_only_trigger"
BEFORE UPDATE OR DELETE ON "streak_events"
FOR EACH ROW
EXECUTE FUNCTION "skillup_reject_progress_event_mutation"();
--> statement-breakpoint
CREATE TRIGGER "learner_badge_events_append_only_trigger"
BEFORE UPDATE OR DELETE ON "learner_badge_events"
FOR EACH ROW
EXECUTE FUNCTION "skillup_reject_progress_event_mutation"();
