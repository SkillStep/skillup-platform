CREATE OR REPLACE FUNCTION "skillup_track_level_session"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  learner_timezone text;
  prior_best integer;
  reward_delta integer;
  learner_local_date date;
  previous_local_date date;
  local_day_gap integer;
  streak_current integer;
  streak_longest integer;
  streak_grace integer;
  next_current integer;
  next_longest integer;
  next_grace integer;
  streak_kind text;
  streak_explanation text;
  inserted_streak_event uuid;
  verified_balance integer;
  verified_completions integer;
  badge record;
BEGIN
  INSERT INTO "learner_progress_settings"
    ("user_id", "timezone", "tier", "leaderboard_opt_in", "leaderboard_alias", "leaderboard_status")
  VALUES
    (NEW."user_id", 'UTC', 'free', false, null, 'eligible')
  ON CONFLICT ("user_id") DO NOTHING;

  SELECT "timezone"
    INTO learner_timezone
    FROM "learner_progress_settings"
   WHERE "user_id" = NEW."user_id";

  learner_timezone := COALESCE(learner_timezone, 'UTC');

  INSERT INTO "learner_streaks"
    ("user_id", "timezone", "current_days", "longest_days", "last_qualified_date", "grace_credits")
  VALUES
    (NEW."user_id", learner_timezone, 0, 0, null, 1)
  ON CONFLICT ("user_id") DO NOTHING;

  INSERT INTO "learner_enrollments"
    ("user_id", "level_id", "state", "last_session_id", "enrolled_at", "completed_at", "updated_at")
  VALUES
    (
      NEW."user_id",
      NEW."level_id",
      CASE WHEN NEW."state" = 'completed' THEN 'completed' ELSE 'in_progress' END,
      NEW."id",
      NEW."started_at",
      CASE WHEN NEW."state" = 'completed' THEN NEW."completed_at" ELSE null END,
      COALESCE(NEW."last_activity_at", NEW."started_at")
    )
  ON CONFLICT ("user_id", "level_id") DO UPDATE
    SET "state" = CASE
          WHEN EXCLUDED."state" = 'completed' THEN 'completed'
          WHEN "learner_enrollments"."state" = 'completed' THEN 'completed'
          ELSE EXCLUDED."state"
        END,
        "last_session_id" = EXCLUDED."last_session_id",
        "completed_at" = CASE
          WHEN EXCLUDED."state" = 'completed' THEN EXCLUDED."completed_at"
          ELSE "learner_enrollments"."completed_at"
        END,
        "updated_at" = EXCLUDED."updated_at";

  IF NEW."state" <> 'completed' OR NEW."completed_at" IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."state" = 'completed' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE("best_awarded_points", 0)
    INTO prior_best
    FROM "learner_level_progress"
   WHERE "user_id" = NEW."user_id"
     AND "level_version_id" = NEW."level_version_id";

  prior_best := COALESCE(prior_best, 0);
  reward_delta := GREATEST(0, NEW."awarded_points" - prior_best);

  IF reward_delta > 0 THEN
    INSERT INTO "points_ledger"
      ("user_id", "event_key", "source_type", "source_id", "points_delta", "reason_code",
       "explanation", "correction_of_id", "occurred_at")
    VALUES
      (
        NEW."user_id",
        'level-completion:' || NEW."id"::text,
        'level_completion',
        NEW."id",
        reward_delta,
        'verified_score_improvement',
        'Awarded ' || reward_delta::text || ' verified point' ||
          CASE WHEN reward_delta = 1 THEN '' ELSE 's' END ||
          ' for improving the saved best score on this published level version.',
        null,
        NEW."completed_at"
      )
    ON CONFLICT ("event_key") DO NOTHING;
  END IF;

  learner_local_date := (NEW."completed_at" AT TIME ZONE learner_timezone)::date;

  SELECT "current_days", "longest_days", "last_qualified_date", "grace_credits"
    INTO streak_current, streak_longest, previous_local_date, streak_grace
    FROM "learner_streaks"
   WHERE "user_id" = NEW."user_id"
   FOR UPDATE;

  IF previous_local_date IS NULL THEN
    next_current := 1;
    next_longest := GREATEST(streak_longest, 1);
    next_grace := streak_grace;
    streak_kind := 'qualified';
    streak_explanation := 'Your first verified learning day started a streak.';
  ELSE
    local_day_gap := learner_local_date - previous_local_date;

    IF local_day_gap <= 0 THEN
      next_current := streak_current;
      next_longest := streak_longest;
      next_grace := streak_grace;
      streak_kind := 'qualified';
      streak_explanation := 'This local day was already counted, so the streak was not increased again.';
    ELSIF local_day_gap = 1 THEN
      next_current := streak_current + 1;
      next_longest := GREATEST(streak_longest, next_current);
      next_grace := streak_grace;
      streak_kind := 'qualified';
      streak_explanation := 'Verified activity on the next local day extended your streak.';
    ELSIF local_day_gap = 2 AND streak_grace > 0 THEN
      next_current := streak_current + 1;
      next_longest := GREATEST(streak_longest, next_current);
      next_grace := streak_grace - 1;
      streak_kind := 'grace';
      streak_explanation := 'One grace credit covered a single missed local day and preserved your streak.';
    ELSE
      next_current := 1;
      next_longest := GREATEST(streak_longest, 1);
      next_grace := streak_grace;
      streak_kind := 'qualified';
      streak_explanation := 'The previous streak ended after missed local days, and verified activity started a new one.';
    END IF;
  END IF;

  INSERT INTO "streak_events"
    ("user_id", "event_key", "event_type", "source_id", "local_date", "timezone",
     "explanation", "occurred_at")
  VALUES
    (
      NEW."user_id",
      'level-completion:' || NEW."id"::text || ':streak',
      streak_kind,
      NEW."id",
      learner_local_date,
      learner_timezone,
      streak_explanation,
      NEW."completed_at"
    )
  ON CONFLICT ("event_key") DO NOTHING
  RETURNING "id" INTO inserted_streak_event;

  IF inserted_streak_event IS NOT NULL AND
     (previous_local_date IS NULL OR learner_local_date > previous_local_date) THEN
    UPDATE "learner_streaks"
       SET "timezone" = learner_timezone,
           "current_days" = next_current,
           "longest_days" = next_longest,
           "last_qualified_date" = learner_local_date,
           "grace_credits" = next_grace,
           "updated_at" = NEW."completed_at"
     WHERE "user_id" = NEW."user_id";
  END IF;

  SELECT COALESCE(SUM("points_delta"), 0)::integer
    INTO verified_balance
    FROM "points_ledger"
   WHERE "user_id" = NEW."user_id";

  SELECT COALESCE(SUM("completion_count"), 0)::integer + 1
    INTO verified_completions
    FROM "learner_level_progress"
   WHERE "user_id" = NEW."user_id";

  FOR badge IN
    SELECT "id", "key", "title", "description", "rule_kind", "threshold"
      FROM "badge_definitions"
     WHERE "state" = 'active'
     ORDER BY "key"
  LOOP
    IF
      (badge."rule_kind" = 'first_level' AND verified_completions >= badge."threshold") OR
      (badge."rule_kind" = 'perfect_level' AND NEW."max_points" > 0 AND
        NEW."awarded_points" = NEW."max_points") OR
      (badge."rule_kind" = 'streak_days' AND next_current >= badge."threshold") OR
      (badge."rule_kind" = 'points_total' AND verified_balance >= badge."threshold")
    THEN
      IF COALESCE(
        (
          SELECT "action"
            FROM "learner_badge_events"
           WHERE "user_id" = NEW."user_id"
             AND "badge_definition_id" = badge."id"
           ORDER BY "occurred_at" DESC, "created_at" DESC
           LIMIT 1
        ),
        ''
      ) <> 'unlocked' THEN
        INSERT INTO "learner_badge_events"
          ("user_id", "badge_definition_id", "event_key", "action", "evidence",
           "explanation", "occurred_at")
        VALUES
          (
            NEW."user_id",
            badge."id",
            'level-completion:' || NEW."id"::text || ':badge:' || badge."key",
            'unlocked',
            jsonb_build_object(
              'sessionId', NEW."id",
              'levelVersionId', NEW."level_version_id",
              'awardedPoints', NEW."awarded_points",
              'maxPoints', NEW."max_points",
              'pointsBalance', verified_balance,
              'currentStreak', next_current,
              'completionCount', verified_completions
            ),
            'Unlocked ' || badge."title" || ': ' || badge."description",
            NEW."completed_at"
          )
        ON CONFLICT ("event_key") DO NOTHING;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "level_play_sessions_progress_trigger"
AFTER INSERT OR UPDATE ON "level_play_sessions"
FOR EACH ROW
EXECUTE FUNCTION "skillup_track_level_session"();
