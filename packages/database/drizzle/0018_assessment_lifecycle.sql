CREATE VIEW published_path_assessment_levels AS
WITH ranked_levels AS (
  SELECT
    lv.id AS level_version_id,
    lp.id AS learning_path_id,
    lv.locale,
    row_number() OVER (
      PARTITION BY lp.id, lv.locale
      ORDER BY lm.sort_order, le.sort_order, l.sort_order, lv.version DESC
    ) AS forward_rank,
    row_number() OVER (
      PARTITION BY lp.id, lv.locale
      ORDER BY lm.sort_order DESC, le.sort_order DESC, l.sort_order DESC, lv.version DESC
    ) AS reverse_rank
  FROM level_versions lv
  JOIN levels l ON l.id = lv.level_id
  JOIN lessons le ON le.id = l.lesson_id
  JOIN learning_modules lm ON lm.id = le.module_id
  JOIN learning_paths lp ON lp.id = lm.learning_path_id
  WHERE lv.state = 'published'
)
SELECT level_version_id, learning_path_id, locale, 'baseline'::text AS assessment_kind
FROM ranked_levels
WHERE forward_rank = 1
UNION ALL
SELECT level_version_id, learning_path_id, locale, 'end_path'::text AS assessment_kind
FROM ranked_levels
WHERE reverse_rank = 1;

CREATE TABLE learner_assessment_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  learning_path_id uuid NOT NULL,
  level_version_id uuid NOT NULL,
  locale text NOT NULL,
  assessment_kind text NOT NULL,
  awarded_points integer NOT NULL,
  max_points integer NOT NULL,
  completed_at timestamp with time zone NOT NULL,
  source_session_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT learner_assessment_results_locale_allowed
    CHECK (locale IN ('en', 'ur')),
  CONSTRAINT learner_assessment_results_kind_allowed
    CHECK (assessment_kind IN ('baseline', 'end_path')),
  CONSTRAINT learner_assessment_results_points_valid
    CHECK (awarded_points >= 0 AND max_points > 0 AND awarded_points <= max_points)
);

ALTER TABLE learner_assessment_results
  ADD CONSTRAINT learner_assessment_results_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade,
  ADD CONSTRAINT learner_assessment_results_path_id_learning_paths_id_fk
    FOREIGN KEY (learning_path_id) REFERENCES learning_paths(id) ON DELETE restrict,
  ADD CONSTRAINT learner_assessment_results_level_version_id_level_versions_id_fk
    FOREIGN KEY (level_version_id) REFERENCES level_versions(id) ON DELETE restrict,
  ADD CONSTRAINT learner_assessment_results_source_session_id_level_play_sessions_id_fk
    FOREIGN KEY (source_session_id) REFERENCES level_play_sessions(id) ON DELETE cascade;

CREATE UNIQUE INDEX learner_assessment_results_session_kind_unique
  ON learner_assessment_results (source_session_id, assessment_kind);
CREATE INDEX learner_assessment_results_user_path_idx
  ON learner_assessment_results (user_id, learning_path_id, assessment_kind, completed_at DESC);

CREATE FUNCTION capture_learner_assessment_result()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.state <> 'completed' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.state = 'completed' THEN
    RETURN NEW;
  END IF;

  INSERT INTO learner_assessment_results (
    user_id,
    learning_path_id,
    level_version_id,
    locale,
    assessment_kind,
    awarded_points,
    max_points,
    completed_at,
    source_session_id
  )
  SELECT
    NEW.user_id,
    assessment.learning_path_id,
    NEW.level_version_id,
    assessment.locale,
    assessment.assessment_kind,
    NEW.awarded_points,
    NEW.max_points,
    NEW.completed_at,
    NEW.id
  FROM published_path_assessment_levels assessment
  WHERE assessment.level_version_id = NEW.level_version_id
  ON CONFLICT (source_session_id, assessment_kind)
  DO UPDATE SET
    awarded_points = excluded.awarded_points,
    max_points = excluded.max_points,
    completed_at = excluded.completed_at;

  RETURN NEW;
END;
$$;

CREATE TRIGGER level_play_sessions_capture_assessment_result
AFTER INSERT OR UPDATE OF state ON level_play_sessions
FOR EACH ROW
EXECUTE FUNCTION capture_learner_assessment_result();

INSERT INTO learner_assessment_results (
  user_id,
  learning_path_id,
  level_version_id,
  locale,
  assessment_kind,
  awarded_points,
  max_points,
  completed_at,
  source_session_id
)
SELECT
  session.user_id,
  assessment.learning_path_id,
  session.level_version_id,
  assessment.locale,
  assessment.assessment_kind,
  session.awarded_points,
  session.max_points,
  session.completed_at,
  session.id
FROM level_play_sessions session
JOIN published_path_assessment_levels assessment
  ON assessment.level_version_id = session.level_version_id
WHERE session.state = 'completed'
  AND session.completed_at IS NOT NULL
  AND session.max_points > 0
ON CONFLICT (source_session_id, assessment_kind) DO NOTHING;
