-- SkillUp internal go-live authorities.
-- Provider credentials remain external. These tables make product behavior complete and fail closed.

alter table auth_sessions
  add column client_label text,
  add column user_agent_digest text,
  add column ip_digest text;

alter table auth_sessions
  add constraint auth_sessions_client_label_length
    check (client_label is null or char_length(client_label) between 1 and 120),
  add constraint auth_sessions_user_agent_digest_format
    check (user_agent_digest is null or user_agent_digest ~ '^[a-f0-9]{64}$'),
  add constraint auth_sessions_ip_digest_format
    check (ip_digest is null or ip_digest ~ '^[a-f0-9]{64}$');

create index auth_sessions_user_active_idx
  on auth_sessions(user_id, revoked_at, last_seen_at desc);

create table learner_privacy_settings (
  user_id uuid primary key references users(id) on delete cascade,
  analytics_consent text not null default 'essential',
  marketing_consent boolean not null default false,
  leaderboard_sharing boolean not null default false,
  achievement_sharing boolean not null default false,
  ai_personalization boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint learner_privacy_settings_analytics_allowed
    check (analytics_consent in ('essential', 'product'))
);

create table policy_documents (
  id uuid primary key default gen_random_uuid(),
  policy_key text not null,
  version text not null,
  locale text not null default 'en',
  title text not null,
  summary text not null,
  body_markdown text not null,
  status text not null default 'draft',
  effective_at timestamptz,
  created_at timestamptz not null default now(),
  unique (policy_key, version, locale),
  constraint policy_documents_key_allowed check (
    policy_key in ('terms', 'privacy', 'refund', 'ai_disclosure', 'leaderboard_sharing', 'fair_use')
  ),
  constraint policy_documents_locale_allowed check (locale in ('en', 'ur')),
  constraint policy_documents_status_allowed check (status in ('draft', 'active', 'retired')),
  constraint policy_documents_title_length check (char_length(title) between 3 and 120),
  constraint policy_documents_summary_length check (char_length(summary) between 10 and 1000),
  constraint policy_documents_body_length check (char_length(body_markdown) between 20 and 100000),
  constraint policy_documents_effective_state check (
    (status = 'draft' and effective_at is null)
    or (status in ('active', 'retired') and effective_at is not null)
  )
);

create unique index policy_documents_one_active
  on policy_documents(policy_key, locale)
  where status = 'active';

create table user_policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  policy_document_id uuid not null references policy_documents(id) on delete restrict,
  accepted_at timestamptz not null default now(),
  acceptance_source text not null,
  evidence_digest text not null,
  unique (user_id, policy_document_id),
  constraint user_policy_acceptances_source_allowed
    check (acceptance_source in ('registration', 'account_settings', 'checkout', 'feature_enablement')),
  constraint user_policy_acceptances_digest_format
    check (evidence_digest ~ '^[a-f0-9]{64}$')
);

create index user_policy_acceptances_user_idx
  on user_policy_acceptances(user_id, accepted_at desc);

create table privacy_export_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  status text not null default 'queued',
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz,
  content_digest text,
  failure_reason text,
  constraint privacy_export_requests_status_allowed
    check (status in ('queued', 'processing', 'completed', 'expired', 'failed')),
  constraint privacy_export_requests_digest_format
    check (content_digest is null or content_digest ~ '^[a-f0-9]{64}$'),
  constraint privacy_export_requests_completion_state check (
    (status = 'completed' and completed_at is not null and expires_at is not null and content_digest is not null)
    or status <> 'completed'
  )
);

create index privacy_export_requests_user_idx
  on privacy_export_requests(user_id, requested_at desc);

create table account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete restrict,
  status text not null default 'cooldown',
  reason text,
  requested_at timestamptz not null default now(),
  execute_after timestamptz not null,
  cancelled_at timestamptz,
  completed_at timestamptz,
  completed_by text,
  unique (user_id, status),
  constraint account_deletion_requests_status_allowed
    check (status in ('cooldown', 'cancelled', 'processing', 'completed', 'failed')),
  constraint account_deletion_requests_reason_length
    check (reason is null or char_length(reason) between 3 and 500),
  constraint account_deletion_requests_schedule
    check (execute_after > requested_at),
  constraint account_deletion_requests_state check (
    (status = 'cooldown' and cancelled_at is null and completed_at is null)
    or (status = 'cancelled' and cancelled_at is not null and completed_at is null)
    or (status in ('processing', 'failed') and completed_at is null)
    or (status = 'completed' and completed_at is not null and completed_by is not null)
  )
);

create unique index account_deletion_requests_active_unique
  on account_deletion_requests(user_id)
  where status in ('cooldown', 'processing');

create table learner_daily_mission_usage (
  user_id uuid not null references users(id) on delete cascade,
  usage_date date not null,
  missions_started integer not null default 0,
  last_session_id uuid references level_play_sessions(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date),
  constraint learner_daily_mission_usage_nonnegative check (missions_started >= 0)
);

create table commercial_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  order_id uuid references payment_orders(id) on delete restrict,
  entitlement_id uuid references entitlements(id) on delete restrict,
  status text not null default 'queued',
  run_after timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_jobs_type_allowed check (
    job_type in ('expire_order', 'reconcile_order', 'expire_entitlement', 'renewal_reminder', 'provider_status', 'provider_refund')
  ),
  constraint commercial_jobs_status_allowed check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  constraint commercial_jobs_attempts check (attempt_count between 0 and 25),
  constraint commercial_jobs_target check (order_id is not null or entitlement_id is not null),
  constraint commercial_jobs_lease_state check (
    (status = 'running' and lease_token is not null and lease_expires_at is not null)
    or status <> 'running'
  )
);

create index commercial_jobs_queue_idx on commercial_jobs(status, run_after);

alter table ai_generation_requests
  add column input_payload jsonb not null default '{}'::jsonb,
  add column lease_token uuid,
  add column lease_expires_at timestamptz,
  add column attempt_count integer not null default 0,
  add column next_attempt_at timestamptz not null default now(),
  add column last_error text,
  add column usage_input_tokens integer,
  add column usage_output_tokens integer,
  add column estimated_cost_microusd integer,
  add column cancelled_at timestamptz;

alter table ai_generation_requests
  add constraint ai_generation_requests_input_object check (jsonb_typeof(input_payload) = 'object'),
  add constraint ai_generation_requests_attempts check (attempt_count between 0 and 25),
  add constraint ai_generation_requests_usage_nonnegative check (
    (usage_input_tokens is null or usage_input_tokens >= 0)
    and (usage_output_tokens is null or usage_output_tokens >= 0)
    and (estimated_cost_microusd is null or estimated_cost_microusd >= 0)
  ),
  add constraint ai_generation_requests_lease_state check (
    (status = 'running' and lease_token is not null and lease_expires_at is not null and started_at is not null)
    or status <> 'running'
  );

create index ai_generation_requests_claim_idx
  on ai_generation_requests(status, next_attempt_at, created_at);

create table ai_job_attempts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references ai_generation_requests(id) on delete restrict,
  attempt_number integer not null,
  provider text not null,
  model text not null,
  status text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  input_digest text not null,
  output_digest text,
  validation_report jsonb not null default '{}'::jsonb,
  quality_score integer,
  input_tokens integer,
  output_tokens integer,
  estimated_cost_microusd integer,
  error_code text,
  error_message text,
  unique (request_id, attempt_number),
  constraint ai_job_attempts_status_allowed check (status in ('running', 'completed', 'failed', 'cancelled')),
  constraint ai_job_attempts_digest_format check (
    input_digest ~ '^[a-f0-9]{64}$' and (output_digest is null or output_digest ~ '^[a-f0-9]{64}$')
  ),
  constraint ai_job_attempts_validation_object check (jsonb_typeof(validation_report) = 'object'),
  constraint ai_job_attempts_score check (quality_score is null or quality_score between 0 and 100),
  constraint ai_job_attempts_usage_nonnegative check (
    (input_tokens is null or input_tokens >= 0)
    and (output_tokens is null or output_tokens >= 0)
    and (estimated_cost_microusd is null or estimated_cost_microusd >= 0)
  )
);

create index ai_job_attempts_request_idx on ai_job_attempts(request_id, attempt_number desc);

create table analytics_consents (
  user_id uuid primary key references users(id) on delete cascade,
  consent_state text not null default 'essential',
  source text not null,
  policy_version text not null,
  updated_at timestamptz not null default now(),
  constraint analytics_consents_state_allowed check (consent_state in ('essential', 'product')),
  constraint analytics_consents_source_allowed check (source in ('registration', 'banner', 'account_settings', 'system'))
);

create table analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  event_version integer not null default 1,
  authority text not null,
  user_id uuid references users(id) on delete set null,
  anonymous_id text,
  session_id text,
  deduplication_key text not null,
  environment text not null,
  release_sha text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  properties jsonb not null default '{}'::jsonb,
  attribution jsonb not null default '{}'::jsonb,
  unique (deduplication_key),
  constraint analytics_events_authority_allowed check (authority in ('server', 'client')),
  constraint analytics_events_environment_allowed check (environment in ('local', 'test', 'staging', 'production')),
  constraint analytics_events_identity check (user_id is not null or anonymous_id is not null),
  constraint analytics_events_properties_object check (jsonb_typeof(properties) = 'object'),
  constraint analytics_events_attribution_object check (jsonb_typeof(attribution) = 'object'),
  constraint analytics_events_name_format check (event_name ~ '^[a-z][a-z0-9_]{2,79}$'),
  constraint analytics_events_version_positive check (event_version > 0),
  constraint analytics_events_deduplication_length check (char_length(deduplication_key) between 8 and 200)
);

create index analytics_events_user_time_idx on analytics_events(user_id, occurred_at desc);
create index analytics_events_name_time_idx on analytics_events(event_name, occurred_at desc);
create index analytics_events_release_idx on analytics_events(environment, release_sha, occurred_at desc);

create table experiment_assignments (
  experiment_key text not null,
  subject_key text not null,
  variant text not null,
  status text not null default 'active',
  assigned_at timestamptz not null default now(),
  expires_at timestamptz,
  primary key (experiment_key, subject_key),
  constraint experiment_assignments_key_format check (experiment_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  constraint experiment_assignments_subject_length check (char_length(subject_key) between 8 and 200),
  constraint experiment_assignments_variant_format check (variant ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  constraint experiment_assignments_status_allowed check (status in ('active', 'stopped', 'opted_out'))
);

create table experiment_exposures (
  id uuid primary key default gen_random_uuid(),
  experiment_key text not null,
  subject_key text not null,
  variant text not null,
  deduplication_key text not null unique,
  exposed_at timestamptz not null default now(),
  release_sha text not null,
  foreign key (experiment_key, subject_key)
    references experiment_assignments(experiment_key, subject_key) on delete restrict
);

create table public_content_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  slug text not null,
  locale text not null default 'en',
  title text not null,
  summary text not null,
  direct_answer text,
  body jsonb not null default '{}'::jsonb,
  source_references jsonb not null default '[]'::jsonb,
  author_name text not null,
  reviewer_name text not null,
  status text not null default 'draft',
  version integer not null default 1,
  published_at timestamptz,
  reviewed_at timestamptz,
  freshness_review_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, slug, locale, version),
  constraint public_content_entries_kind_allowed check (kind in ('guide', 'question', 'glossary', 'comparison')),
  constraint public_content_entries_locale_allowed check (locale in ('en', 'ur')),
  constraint public_content_entries_status_allowed check (status in ('draft', 'in_review', 'approved', 'scheduled', 'published', 'superseded', 'archived')),
  constraint public_content_entries_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint public_content_entries_body_object check (jsonb_typeof(body) = 'object'),
  constraint public_content_entries_sources_array check (jsonb_typeof(source_references) = 'array'),
  constraint public_content_entries_version_positive check (version > 0),
  constraint public_content_entries_publish_state check (
    (status = 'published' and published_at is not null and reviewed_at is not null)
    or status <> 'published'
  )
);

create unique index public_content_entries_current_published
  on public_content_entries(kind, slug, locale)
  where status = 'published';

create table content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid references users(id) on delete set null,
  target_type text not null,
  target_id text not null,
  category text not null,
  description text not null,
  status text not null default 'open',
  assigned_to uuid references admin_principals(user_id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text,
  constraint content_reports_target_allowed check (target_type in ('public_content', 'skill', 'level', 'achievement_share', 'leaderboard_alias')),
  constraint content_reports_category_allowed check (category in ('incorrect', 'unsafe', 'outdated', 'privacy', 'abuse', 'copyright', 'other')),
  constraint content_reports_status_allowed check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  constraint content_reports_description_length check (char_length(description) between 10 and 2000)
);

create index content_reports_queue_idx on content_reports(status, created_at);

create table moderation_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references content_reports(id) on delete restrict,
  actor_user_id uuid not null references admin_principals(user_id) on delete restrict,
  action text not null,
  target_type text not null,
  target_id text not null,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint moderation_actions_action_allowed check (action in ('assign', 'dismiss', 'resolve', 'suspend', 'restore', 'archive', 'correct')),
  constraint moderation_actions_reason_length check (char_length(reason) between 3 and 1000),
  constraint moderation_actions_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table admin_exports (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references admin_principals(user_id) on delete restrict,
  export_type text not null,
  filters jsonb not null default '{}'::jsonb,
  reason text not null,
  status text not null default 'queued',
  row_count integer,
  content_digest text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz,
  constraint admin_exports_type_allowed check (export_type in ('analytics', 'payments', 'content', 'support', 'audit')),
  constraint admin_exports_status_allowed check (status in ('queued', 'processing', 'completed', 'expired', 'failed')),
  constraint admin_exports_filters_object check (jsonb_typeof(filters) = 'object'),
  constraint admin_exports_reason_length check (char_length(reason) between 3 and 500),
  constraint admin_exports_row_count check (row_count is null or row_count >= 0),
  constraint admin_exports_digest_format check (content_digest is null or content_digest ~ '^[a-f0-9]{64}$')
);

create index admin_exports_requester_idx on admin_exports(requested_by, created_at desc);
