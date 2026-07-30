CREATE TABLE "challenge_answer_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_version_id" uuid NOT NULL,
	"option_key" text NOT NULL,
	"label" text NOT NULL,
	"accessible_label" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_answer_options_key_format" CHECK ("challenge_answer_options"."option_key" ~ '^[a-z0-9_]{1,40}$'),
	CONSTRAINT "challenge_answer_options_label_length" CHECK (char_length("challenge_answer_options"."label") between 1 and 500),
	CONSTRAINT "challenge_answer_options_accessible_label_length" CHECK ("challenge_answer_options"."accessible_label" is null or char_length("challenge_answer_options"."accessible_label") between 1 and 500),
	CONSTRAINT "challenge_answer_options_sort_order_nonnegative" CHECK ("challenge_answer_options"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "challenge_evaluations" (
	"challenge_version_id" uuid PRIMARY KEY NOT NULL,
	"evaluator" text DEFAULT 'deterministic_v1' NOT NULL,
	"private_evaluation" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_evaluations_evaluator_format" CHECK ("challenge_evaluations"."evaluator" ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
	CONSTRAINT "challenge_evaluations_private_object" CHECK (jsonb_typeof("challenge_evaluations"."private_evaluation") = 'object' and "challenge_evaluations"."private_evaluation" <> '{}'::jsonb)
);
--> statement-breakpoint
CREATE TABLE "challenge_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"level_version_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"locale" text NOT NULL,
	"type" text NOT NULL,
	"prompt" text NOT NULL,
	"instruction" text,
	"explanation" text NOT NULL,
	"public_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"points" integer DEFAULT 10 NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_versions_positive_version" CHECK ("challenge_versions"."version" > 0),
	CONSTRAINT "challenge_versions_locale_allowed" CHECK ("challenge_versions"."locale" in ('en', 'ur')),
	CONSTRAINT "challenge_versions_type_allowed" CHECK ("challenge_versions"."type" in ('multiple_choice', 'true_false', 'ordering', 'matching', 'scenario', 'fill_blank', 'short_response')),
	CONSTRAINT "challenge_versions_state_allowed" CHECK ("challenge_versions"."state" in ('draft', 'in_review', 'approved', 'scheduled', 'published', 'superseded', 'archived', 'rejected')),
	CONSTRAINT "challenge_versions_prompt_length" CHECK (char_length("challenge_versions"."prompt") between 10 and 1000),
	CONSTRAINT "challenge_versions_instruction_length" CHECK ("challenge_versions"."instruction" is null or char_length("challenge_versions"."instruction") between 3 and 300),
	CONSTRAINT "challenge_versions_explanation_length" CHECK (char_length("challenge_versions"."explanation") between 20 and 1000),
	CONSTRAINT "challenge_versions_points_range" CHECK ("challenge_versions"."points" between 0 and 1000),
	CONSTRAINT "challenge_versions_public_payload_object" CHECK (jsonb_typeof("challenge_versions"."public_payload") = 'object'),
	CONSTRAINT "challenge_versions_publication_metadata" CHECK (("challenge_versions"."state" <> 'published') or ("challenge_versions"."reviewed_at" is not null and "challenge_versions"."published_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenges_slug_format" CHECK ("challenges"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "challenges_sort_order_nonnegative" CHECK ("challenges"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "content_publication_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_version_id" uuid NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"index_policy" text DEFAULT 'noindex' NOT NULL,
	"canonical_path" text,
	"source_version_id" uuid,
	"reviewed_at" timestamp with time zone,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_publication_records_entity_type" CHECK ("content_publication_records"."entity_type" in ('skill_category_version', 'skill_version', 'learning_path_version', 'module_version', 'lesson_version', 'level_version', 'challenge_version')),
	CONSTRAINT "content_publication_records_state_allowed" CHECK ("content_publication_records"."state" in ('draft', 'in_review', 'approved', 'scheduled', 'published', 'superseded', 'archived', 'rejected')),
	CONSTRAINT "content_publication_records_index_policy" CHECK ("content_publication_records"."index_policy" in ('index', 'noindex')),
	CONSTRAINT "content_publication_records_canonical_path" CHECK ("content_publication_records"."canonical_path" is null or "content_publication_records"."canonical_path" ~ '^/(en|ur)/[a-z0-9/-]+$'),
	CONSTRAINT "content_publication_records_publication_metadata" CHECK (("content_publication_records"."state" <> 'published') or ("content_publication_records"."reviewed_at" is not null and "content_publication_records"."published_at" is not null and "content_publication_records"."canonical_path" is not null))
);
--> statement-breakpoint
CREATE TABLE "content_source_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level_version_id" uuid,
	"challenge_version_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"publisher" text,
	"url" text,
	"locator" text,
	"retrieved_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_source_references_one_owner" CHECK (num_nonnulls("content_source_references"."level_version_id", "content_source_references"."challenge_version_id") = 1),
	CONSTRAINT "content_source_references_kind_allowed" CHECK ("content_source_references"."kind" in ('internal_editorial', 'primary', 'official', 'research')),
	CONSTRAINT "content_source_references_title_length" CHECK (char_length("content_source_references"."title") between 3 and 300),
	CONSTRAINT "content_source_references_external_url" CHECK ("content_source_references"."url" is null or "content_source_references"."url" ~ '^https://[^[:space:]]+$'),
	CONSTRAINT "content_source_references_sort_order_nonnegative" CHECK ("content_source_references"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "learning_module_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"learning_path_version_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"index_policy" text DEFAULT 'noindex' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_module_versions_positive_version" CHECK ("learning_module_versions"."version" > 0),
	CONSTRAINT "learning_module_versions_locale_allowed" CHECK ("learning_module_versions"."locale" in ('en', 'ur')),
	CONSTRAINT "learning_module_versions_state_allowed" CHECK ("learning_module_versions"."state" in ('draft', 'in_review', 'approved', 'scheduled', 'published', 'superseded', 'archived', 'rejected')),
	CONSTRAINT "learning_module_versions_index_policy" CHECK ("learning_module_versions"."index_policy" in ('index', 'noindex')),
	CONSTRAINT "learning_module_versions_title_length" CHECK (char_length("learning_module_versions"."title") between 3 and 120),
	CONSTRAINT "learning_module_versions_summary_length" CHECK (char_length("learning_module_versions"."summary") between 40 and 300),
	CONSTRAINT "learning_module_versions_publication_metadata" CHECK (("learning_module_versions"."state" <> 'published') or ("learning_module_versions"."reviewed_at" is not null and "learning_module_versions"."published_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "learning_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learning_path_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_modules_slug_format" CHECK ("learning_modules"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "learning_modules_sort_order_nonnegative" CHECK ("learning_modules"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "learning_objectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level_version_id" uuid NOT NULL,
	"code" text NOT NULL,
	"statement" text NOT NULL,
	"assessable" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_objectives_code_format" CHECK ("learning_objectives"."code" ~ '^[A-Z][A-Z0-9_]{2,39}$'),
	CONSTRAINT "learning_objectives_statement_length" CHECK (char_length("learning_objectives"."statement") between 10 and 240),
	CONSTRAINT "learning_objectives_sort_order_nonnegative" CHECK ("learning_objectives"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "lesson_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"module_version_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"estimated_minutes" integer NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"index_policy" text DEFAULT 'noindex' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_versions_positive_version" CHECK ("lesson_versions"."version" > 0),
	CONSTRAINT "lesson_versions_locale_allowed" CHECK ("lesson_versions"."locale" in ('en', 'ur')),
	CONSTRAINT "lesson_versions_state_allowed" CHECK ("lesson_versions"."state" in ('draft', 'in_review', 'approved', 'scheduled', 'published', 'superseded', 'archived', 'rejected')),
	CONSTRAINT "lesson_versions_index_policy" CHECK ("lesson_versions"."index_policy" in ('index', 'noindex')),
	CONSTRAINT "lesson_versions_title_length" CHECK (char_length("lesson_versions"."title") between 3 and 120),
	CONSTRAINT "lesson_versions_summary_length" CHECK (char_length("lesson_versions"."summary") between 40 and 300),
	CONSTRAINT "lesson_versions_estimated_minutes" CHECK ("lesson_versions"."estimated_minutes" between 1 and 120),
	CONSTRAINT "lesson_versions_publication_metadata" CHECK (("lesson_versions"."state" <> 'published') or ("lesson_versions"."reviewed_at" is not null and "lesson_versions"."published_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lessons_slug_format" CHECK ("lessons"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "lessons_sort_order_nonnegative" CHECK ("lessons"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "level_prerequisites" (
	"level_id" uuid NOT NULL,
	"prerequisite_level_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "level_prerequisites_not_self" CHECK ("level_prerequisites"."level_id" <> "level_prerequisites"."prerequisite_level_id")
);
--> statement-breakpoint
CREATE TABLE "level_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level_id" uuid NOT NULL,
	"lesson_version_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"public_summary" text NOT NULL,
	"instructions" text NOT NULL,
	"estimated_minutes" integer NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"index_policy" text DEFAULT 'noindex' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "level_versions_positive_version" CHECK ("level_versions"."version" > 0),
	CONSTRAINT "level_versions_locale_allowed" CHECK ("level_versions"."locale" in ('en', 'ur')),
	CONSTRAINT "level_versions_state_allowed" CHECK ("level_versions"."state" in ('draft', 'in_review', 'approved', 'scheduled', 'published', 'superseded', 'archived', 'rejected')),
	CONSTRAINT "level_versions_index_policy" CHECK ("level_versions"."index_policy" in ('index', 'noindex')),
	CONSTRAINT "level_versions_title_length" CHECK (char_length("level_versions"."title") between 3 and 120),
	CONSTRAINT "level_versions_public_summary_length" CHECK (char_length("level_versions"."public_summary") between 40 and 300),
	CONSTRAINT "level_versions_instructions_length" CHECK (char_length("level_versions"."instructions") between 20 and 1000),
	CONSTRAINT "level_versions_estimated_minutes" CHECK ("level_versions"."estimated_minutes" between 1 and 20),
	CONSTRAINT "level_versions_publication_metadata" CHECK (("level_versions"."state" <> 'published') or ("level_versions"."reviewed_at" is not null and "level_versions"."published_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "levels_slug_format" CHECK ("levels"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "levels_sort_order_nonnegative" CHECK ("levels"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "skill_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"default_locale" text DEFAULT 'en' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_categories_slug_format" CHECK ("skill_categories"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "skill_categories_locale_allowed" CHECK ("skill_categories"."default_locale" in ('en', 'ur')),
	CONSTRAINT "skill_categories_sort_order_nonnegative" CHECK ("skill_categories"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "skill_category_memberships" (
	"category_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_category_memberships_sort_order_nonnegative" CHECK ("skill_category_memberships"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "skill_category_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"index_policy" text DEFAULT 'noindex' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_category_versions_positive_version" CHECK ("skill_category_versions"."version" > 0),
	CONSTRAINT "skill_category_versions_locale_allowed" CHECK ("skill_category_versions"."locale" in ('en', 'ur')),
	CONSTRAINT "skill_category_versions_state_allowed" CHECK ("skill_category_versions"."state" in ('draft', 'in_review', 'approved', 'scheduled', 'published', 'superseded', 'archived', 'rejected')),
	CONSTRAINT "skill_category_versions_index_policy" CHECK ("skill_category_versions"."index_policy" in ('index', 'noindex')),
	CONSTRAINT "skill_category_versions_title_length" CHECK (char_length("skill_category_versions"."title") between 3 and 100),
	CONSTRAINT "skill_category_versions_summary_length" CHECK (char_length("skill_category_versions"."summary") between 40 and 300),
	CONSTRAINT "skill_category_versions_publication_metadata" CHECK (("skill_category_versions"."state" <> 'published') or ("skill_category_versions"."reviewed_at" is not null and "skill_category_versions"."published_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "challenge_answer_options" ADD CONSTRAINT "challenge_answer_options_challenge_version_id_challenge_versions_id_fk" FOREIGN KEY ("challenge_version_id") REFERENCES "public"."challenge_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_evaluations" ADD CONSTRAINT "challenge_evaluations_challenge_version_id_challenge_versions_id_fk" FOREIGN KEY ("challenge_version_id") REFERENCES "public"."challenge_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_versions" ADD CONSTRAINT "challenge_versions_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_versions" ADD CONSTRAINT "challenge_versions_level_version_id_level_versions_id_fk" FOREIGN KEY ("level_version_id") REFERENCES "public"."level_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_source_references" ADD CONSTRAINT "content_source_references_level_version_id_level_versions_id_fk" FOREIGN KEY ("level_version_id") REFERENCES "public"."level_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_source_references" ADD CONSTRAINT "content_source_references_challenge_version_id_challenge_versions_id_fk" FOREIGN KEY ("challenge_version_id") REFERENCES "public"."challenge_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_module_versions" ADD CONSTRAINT "learning_module_versions_module_id_learning_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."learning_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_module_versions" ADD CONSTRAINT "learning_module_versions_learning_path_version_id_learning_path_versions_id_fk" FOREIGN KEY ("learning_path_version_id") REFERENCES "public"."learning_path_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_modules" ADD CONSTRAINT "learning_modules_learning_path_id_learning_paths_id_fk" FOREIGN KEY ("learning_path_id") REFERENCES "public"."learning_paths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_objectives" ADD CONSTRAINT "learning_objectives_level_version_id_level_versions_id_fk" FOREIGN KEY ("level_version_id") REFERENCES "public"."level_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_versions" ADD CONSTRAINT "lesson_versions_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_versions" ADD CONSTRAINT "lesson_versions_module_version_id_learning_module_versions_id_fk" FOREIGN KEY ("module_version_id") REFERENCES "public"."learning_module_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_module_id_learning_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."learning_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_prerequisites" ADD CONSTRAINT "level_prerequisites_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_prerequisites" ADD CONSTRAINT "level_prerequisites_prerequisite_level_id_levels_id_fk" FOREIGN KEY ("prerequisite_level_id") REFERENCES "public"."levels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_versions" ADD CONSTRAINT "level_versions_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_versions" ADD CONSTRAINT "level_versions_lesson_version_id_lesson_versions_id_fk" FOREIGN KEY ("lesson_version_id") REFERENCES "public"."lesson_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "levels" ADD CONSTRAINT "levels_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_category_memberships" ADD CONSTRAINT "skill_category_memberships_category_id_skill_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."skill_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_category_memberships" ADD CONSTRAINT "skill_category_memberships_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_category_versions" ADD CONSTRAINT "skill_category_versions_category_id_skill_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."skill_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_answer_options_key_unique" ON "challenge_answer_options" USING btree ("challenge_version_id","option_key");--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_answer_options_order_unique" ON "challenge_answer_options" USING btree ("challenge_version_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_versions_identity_unique" ON "challenge_versions" USING btree ("challenge_id","version","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "challenges_level_slug_unique" ON "challenges" USING btree ("level_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "challenges_level_order_unique" ON "challenges" USING btree ("level_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "content_publication_records_entity_unique" ON "content_publication_records" USING btree ("entity_type","entity_version_id");--> statement-breakpoint
CREATE INDEX "content_source_references_level_idx" ON "content_source_references" USING btree ("level_version_id");--> statement-breakpoint
CREATE INDEX "content_source_references_challenge_idx" ON "content_source_references" USING btree ("challenge_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "learning_module_versions_identity_unique" ON "learning_module_versions" USING btree ("module_id","version","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "learning_modules_path_slug_unique" ON "learning_modules" USING btree ("learning_path_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "learning_modules_path_order_unique" ON "learning_modules" USING btree ("learning_path_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "learning_objectives_level_code_unique" ON "learning_objectives" USING btree ("level_version_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "learning_objectives_level_order_unique" ON "learning_objectives" USING btree ("level_version_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_versions_identity_unique" ON "lesson_versions" USING btree ("lesson_id","version","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "lessons_module_slug_unique" ON "lessons" USING btree ("module_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "lessons_module_order_unique" ON "lessons" USING btree ("module_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "level_prerequisites_edge_unique" ON "level_prerequisites" USING btree ("level_id","prerequisite_level_id");--> statement-breakpoint
CREATE UNIQUE INDEX "level_versions_identity_unique" ON "level_versions" USING btree ("level_id","version","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "levels_lesson_slug_unique" ON "levels" USING btree ("lesson_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "levels_lesson_order_unique" ON "levels" USING btree ("lesson_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_categories_slug_unique" ON "skill_categories" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_category_memberships_skill_unique" ON "skill_category_memberships" USING btree ("skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_category_memberships_order_unique" ON "skill_category_memberships" USING btree ("category_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_category_versions_identity_unique" ON "skill_category_versions" USING btree ("category_id","version","locale");--> statement-breakpoint
-- skillup_domain_guard_marker
CREATE OR REPLACE FUNCTION enforce_editorial_state_transition() RETURNS trigger AS $$
BEGIN
  IF NEW.state = OLD.state THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.state = 'draft' AND NEW.state IN ('in_review', 'rejected', 'archived')) OR
    (OLD.state = 'in_review' AND NEW.state IN ('draft', 'approved', 'rejected')) OR
    (OLD.state = 'approved' AND NEW.state IN ('draft', 'scheduled', 'published', 'rejected')) OR
    (OLD.state = 'scheduled' AND NEW.state IN ('approved', 'published', 'archived')) OR
    (OLD.state = 'published' AND NEW.state IN ('superseded', 'archived')) OR
    (OLD.state = 'superseded' AND NEW.state = 'archived') OR
    (OLD.state = 'rejected' AND NEW.state IN ('draft', 'archived'))
  ) THEN
    RAISE EXCEPTION 'Unsupported editorial transition from % to % on %', OLD.state, NEW.state, TG_TABLE_NAME;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_published_version_content() RETURNS trigger AS $$
DECLARE
  old_content jsonb;
  new_content jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.state = 'published' THEN
      RAISE EXCEPTION 'Published content version % cannot be deleted', OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.state = 'published' THEN
    old_content := to_jsonb(OLD) - ARRAY['state', 'scheduled_at'];
    new_content := to_jsonb(NEW) - ARRAY['state', 'scheduled_at'];
    IF old_content IS DISTINCT FROM new_content THEN
      RAISE EXCEPTION 'Published content version % cannot be mutated; create a new version', OLD.id;
    END IF;
  END IF;

  RETURN enforce_editorial_state_transition();
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_legacy_published_version_content() RETURNS trigger AS $$
DECLARE
  old_content jsonb;
  new_content jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'published' THEN
      RAISE EXCEPTION 'Published legacy content version % cannot be deleted', OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'published' THEN
    old_content := to_jsonb(OLD) - 'status';
    new_content := to_jsonb(NEW) - 'status';
    IF old_content IS DISTINCT FROM new_content OR NEW.status NOT IN ('published', 'archived') THEN
      RAISE EXCEPTION 'Published legacy content version % cannot be mutated; create a new version', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER protect_skill_category_versions
  BEFORE UPDATE OR DELETE ON skill_category_versions
  FOR EACH ROW EXECUTE FUNCTION protect_published_version_content();
--> statement-breakpoint
CREATE TRIGGER protect_learning_module_versions
  BEFORE UPDATE OR DELETE ON learning_module_versions
  FOR EACH ROW EXECUTE FUNCTION protect_published_version_content();
--> statement-breakpoint
CREATE TRIGGER protect_lesson_versions
  BEFORE UPDATE OR DELETE ON lesson_versions
  FOR EACH ROW EXECUTE FUNCTION protect_published_version_content();
--> statement-breakpoint
CREATE TRIGGER protect_level_versions
  BEFORE UPDATE OR DELETE ON level_versions
  FOR EACH ROW EXECUTE FUNCTION protect_published_version_content();
--> statement-breakpoint
CREATE TRIGGER protect_challenge_versions
  BEFORE UPDATE OR DELETE ON challenge_versions
  FOR EACH ROW EXECUTE FUNCTION protect_published_version_content();
--> statement-breakpoint
CREATE TRIGGER protect_skill_versions
  BEFORE UPDATE OR DELETE ON skill_versions
  FOR EACH ROW EXECUTE FUNCTION protect_legacy_published_version_content();
--> statement-breakpoint
CREATE TRIGGER protect_learning_path_versions
  BEFORE UPDATE OR DELETE ON learning_path_versions
  FOR EACH ROW EXECUTE FUNCTION protect_legacy_published_version_content();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_level_prerequisite_cycle() RETURNS trigger AS $$
DECLARE
  cycle_found boolean;
BEGIN
  WITH RECURSIVE prerequisites(level_id) AS (
    SELECT NEW.prerequisite_level_id
    UNION
    SELECT edge.prerequisite_level_id
    FROM level_prerequisites edge
    JOIN prerequisites current ON edge.level_id = current.level_id
    WHERE TG_OP = 'INSERT'
       OR edge.level_id <> OLD.level_id
       OR edge.prerequisite_level_id <> OLD.prerequisite_level_id
  )
  SELECT EXISTS (SELECT 1 FROM prerequisites WHERE level_id = NEW.level_id)
    INTO cycle_found;

  IF cycle_found THEN
    RAISE EXCEPTION 'Level prerequisite cycle detected for level %', NEW.level_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER prevent_level_prerequisite_cycle_trigger
  BEFORE INSERT OR UPDATE ON level_prerequisites
  FOR EACH ROW EXECUTE FUNCTION prevent_level_prerequisite_cycle();
--> statement-breakpoint
ALTER TABLE challenge_versions
  ADD CONSTRAINT challenge_versions_public_payload_has_no_answers
  CHECK (NOT (public_payload ?| ARRAY['answer', 'answers', 'correctOptionKey', 'correctOptionKeys', 'correctOrder', 'rubric', 'privateEvaluation']));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_published_challenge() RETURNS trigger AS $$
DECLARE
  option_count integer;
  evaluation_count integer;
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
  IF NEW.type IN ('multiple_choice', 'true_false', 'ordering', 'matching', 'scenario') AND option_count < 2 THEN
    RAISE EXCEPTION 'Published challenge % requires at least two public answer options', NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER validate_published_challenge_trigger
  AFTER INSERT OR UPDATE ON challenge_versions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_published_challenge();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_published_challenge_child() RETURNS trigger AS $$
DECLARE
  owner_id uuid;
  owner_state text;
BEGIN
  owner_id := COALESCE(NEW.challenge_version_id, OLD.challenge_version_id);
  SELECT state INTO owner_state FROM challenge_versions WHERE id = owner_id;
  IF owner_state = 'published' THEN
    RAISE EXCEPTION 'Published challenge % child records cannot be mutated', owner_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER protect_published_challenge_options
  BEFORE INSERT OR UPDATE OR DELETE ON challenge_answer_options
  FOR EACH ROW EXECUTE FUNCTION protect_published_challenge_child();
--> statement-breakpoint
CREATE TRIGGER protect_published_challenge_evaluation
  BEFORE INSERT OR UPDATE OR DELETE ON challenge_evaluations
  FOR EACH ROW EXECUTE FUNCTION protect_published_challenge_child();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_published_level_child() RETURNS trigger AS $$
DECLARE
  owner_id uuid;
  owner_state text;
BEGIN
  owner_id := COALESCE(NEW.level_version_id, OLD.level_version_id);
  SELECT state INTO owner_state FROM level_versions WHERE id = owner_id;
  IF owner_state = 'published' THEN
    RAISE EXCEPTION 'Published level % child records cannot be mutated', owner_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER protect_published_level_objectives
  BEFORE INSERT OR UPDATE OR DELETE ON learning_objectives
  FOR EACH ROW EXECUTE FUNCTION protect_published_level_child();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_publication_entity() RETURNS trigger AS $$
DECLARE
  entity_exists boolean := false;
BEGIN
  CASE NEW.entity_type
    WHEN 'skill_category_version' THEN SELECT EXISTS(SELECT 1 FROM skill_category_versions WHERE id = NEW.entity_version_id) INTO entity_exists;
    WHEN 'skill_version' THEN SELECT EXISTS(SELECT 1 FROM skill_versions WHERE id = NEW.entity_version_id) INTO entity_exists;
    WHEN 'learning_path_version' THEN SELECT EXISTS(SELECT 1 FROM learning_path_versions WHERE id = NEW.entity_version_id) INTO entity_exists;
    WHEN 'module_version' THEN SELECT EXISTS(SELECT 1 FROM learning_module_versions WHERE id = NEW.entity_version_id) INTO entity_exists;
    WHEN 'lesson_version' THEN SELECT EXISTS(SELECT 1 FROM lesson_versions WHERE id = NEW.entity_version_id) INTO entity_exists;
    WHEN 'level_version' THEN SELECT EXISTS(SELECT 1 FROM level_versions WHERE id = NEW.entity_version_id) INTO entity_exists;
    WHEN 'challenge_version' THEN SELECT EXISTS(SELECT 1 FROM challenge_versions WHERE id = NEW.entity_version_id) INTO entity_exists;
  END CASE;

  IF NOT entity_exists THEN
    RAISE EXCEPTION 'Publication record references missing % %', NEW.entity_type, NEW.entity_version_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER validate_publication_entity_trigger
  AFTER INSERT OR UPDATE ON content_publication_records
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_publication_entity();
--> statement-breakpoint
CREATE TRIGGER enforce_publication_record_transition
  BEFORE UPDATE ON content_publication_records
  FOR EACH ROW EXECUTE FUNCTION enforce_editorial_state_transition();
