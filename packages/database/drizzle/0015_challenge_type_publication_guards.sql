CREATE OR REPLACE FUNCTION validate_published_challenge() RETURNS trigger AS $$
DECLARE
  option_count integer;
  evaluation_count integer;
  matching_left_count integer;
  matching_right_count integer;
BEGIN
  IF NEW.state <> 'published' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO option_count
    FROM challenge_answer_options
    WHERE challenge_version_id = NEW.id;
  SELECT count(*) INTO evaluation_count
    FROM challenge_evaluations
    WHERE challenge_version_id = NEW.id;

  IF evaluation_count <> 1 THEN
    RAISE EXCEPTION 'Published challenge % must have exactly one protected evaluation', NEW.id;
  END IF;

  IF NEW.type IN ('multiple_choice', 'ordering', 'scenario') AND option_count < 2 THEN
    RAISE EXCEPTION 'Published challenge % requires at least two public answer options', NEW.id;
  END IF;

  IF NEW.type = 'true_false' AND option_count <> 2 THEN
    RAISE EXCEPTION 'Published true/false challenge % requires exactly two public answer options', NEW.id;
  END IF;

  IF NEW.type = 'matching' THEN
    IF jsonb_typeof(NEW.public_payload -> 'left') <> 'array'
       OR jsonb_typeof(NEW.public_payload -> 'right') <> 'array' THEN
      RAISE EXCEPTION 'Published matching challenge % requires left and right option arrays', NEW.id;
    END IF;

    matching_left_count := jsonb_array_length(NEW.public_payload -> 'left');
    matching_right_count := jsonb_array_length(NEW.public_payload -> 'right');
    IF matching_left_count < 2 OR matching_right_count < 2 THEN
      RAISE EXCEPTION 'Published matching challenge % requires at least two items on each side', NEW.id;
    END IF;
    IF matching_left_count <> matching_right_count THEN
      RAISE EXCEPTION 'Published matching challenge % requires equal left and right item counts', NEW.id;
    END IF;
  END IF;

  IF NEW.type = 'fill_blank' THEN
    IF jsonb_typeof(NEW.public_payload -> 'placeholder') <> 'string'
       OR jsonb_typeof(NEW.public_payload -> 'maxLength') <> 'number'
       OR (NEW.public_payload ->> 'maxLength')::integer NOT BETWEEN 1 AND 500 THEN
      RAISE EXCEPTION 'Published fill-blank challenge % has an invalid public payload', NEW.id;
    END IF;
  END IF;

  IF NEW.type = 'short_response' THEN
    IF jsonb_typeof(NEW.public_payload -> 'placeholder') <> 'string'
       OR jsonb_typeof(NEW.public_payload -> 'maxLength') <> 'number'
       OR (NEW.public_payload ->> 'maxLength')::integer NOT BETWEEN 20 AND 2000
       OR jsonb_typeof(NEW.public_payload -> 'evaluationNotice') <> 'string'
       OR char_length(NEW.public_payload ->> 'evaluationNotice') NOT BETWEEN 20 AND 300 THEN
      RAISE EXCEPTION 'Published short-response challenge % has an invalid public payload', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
