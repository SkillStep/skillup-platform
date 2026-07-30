CREATE TABLE "learning_path_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learning_path_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"estimated_minutes" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_path_versions_positive_version" CHECK ("learning_path_versions"."version" > 0),
	CONSTRAINT "learning_path_versions_locale_allowed" CHECK ("learning_path_versions"."locale" in ('en', 'ur')),
	CONSTRAINT "learning_path_versions_status_allowed" CHECK ("learning_path_versions"."status" in ('draft', 'in_review', 'published', 'archived')),
	CONSTRAINT "learning_path_versions_estimated_minutes" CHECK ("learning_path_versions"."estimated_minutes" between 5 and 3000),
	CONSTRAINT "learning_path_versions_title_length" CHECK (char_length("learning_path_versions"."title") between 3 and 120),
	CONSTRAINT "learning_path_versions_summary_length" CHECK (char_length("learning_path_versions"."summary") between 40 and 300)
);
--> statement-breakpoint
CREATE TABLE "learning_paths" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_paths_slug_format" CHECK ("learning_paths"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "learning_paths_status_allowed" CHECK ("learning_paths"."status" in ('draft', 'in_review', 'published', 'archived')),
	CONSTRAINT "learning_paths_sort_order_nonnegative" CHECK ("learning_paths"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "skill_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_versions_positive_version" CHECK ("skill_versions"."version" > 0),
	CONSTRAINT "skill_versions_locale_allowed" CHECK ("skill_versions"."locale" in ('en', 'ur')),
	CONSTRAINT "skill_versions_status_allowed" CHECK ("skill_versions"."status" in ('draft', 'in_review', 'published', 'archived')),
	CONSTRAINT "skill_versions_title_length" CHECK (char_length("skill_versions"."title") between 3 and 100),
	CONSTRAINT "skill_versions_summary_length" CHECK (char_length("skill_versions"."summary") between 40 and 300)
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"default_locale" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_slug_format" CHECK ("skills"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "skills_status_allowed" CHECK ("skills"."status" in ('draft', 'in_review', 'published', 'archived')),
	CONSTRAINT "skills_locale_allowed" CHECK ("skills"."default_locale" in ('en', 'ur'))
);
--> statement-breakpoint
ALTER TABLE "learning_path_versions" ADD CONSTRAINT "learning_path_versions_learning_path_id_learning_paths_id_fk" FOREIGN KEY ("learning_path_id") REFERENCES "public"."learning_paths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_paths" ADD CONSTRAINT "learning_paths_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_versions" ADD CONSTRAINT "skill_versions_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "learning_path_versions_identity_unique" ON "learning_path_versions" USING btree ("learning_path_id","version","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "learning_paths_slug_unique" ON "learning_paths" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_versions_identity_unique" ON "skill_versions" USING btree ("skill_id","version","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_slug_unique" ON "skills" USING btree ("slug");