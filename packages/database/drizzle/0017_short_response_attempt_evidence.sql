ALTER TABLE challenge_attempts
  ADD COLUMN confidence numeric(4,3),
  ADD COLUMN matched_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN review_reason text;

ALTER TABLE challenge_attempts
  ADD CONSTRAINT challenge_attempts_confidence_range
    CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  ADD CONSTRAINT challenge_attempts_matched_criteria_array
    CHECK (jsonb_typeof(matched_criteria) = 'array'),
  ADD CONSTRAINT challenge_attempts_review_reason_length
    CHECK (review_reason IS NULL OR char_length(review_reason) BETWEEN 1 AND 120),
  ADD CONSTRAINT challenge_attempts_review_evidence_consistent
    CHECK (
      (status = 'needs_review' AND review_reason IS NOT NULL)
      OR status <> 'needs_review'
      OR confidence IS NULL
    );
