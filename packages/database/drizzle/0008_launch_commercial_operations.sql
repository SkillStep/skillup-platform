-- SkillUp launch commercial, AI review, and privileged operations source of truth.
-- All provider credentials remain external; this migration is safe with premium/JazzCash disabled.

create table commercial_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_plans_code_format check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint commercial_plans_status_allowed check (status in ('draft', 'active', 'retired')),
  constraint commercial_plans_name_length check (char_length(name) between 3 and 80)
);

create table commercial_plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references commercial_plans(id) on delete restrict,
  version integer not null,
  currency text not null default 'PKR',
  amount_minor integer not null,
  billing_period text not null,
  status text not null default 'draft',
  capabilities jsonb not null default '[]'::jsonb,
  terms_version text not null,
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  unique (plan_id, version),
  constraint commercial_plan_versions_positive check (version > 0),
  constraint commercial_plan_versions_currency check (currency = 'PKR'),
  constraint commercial_plan_versions_amount check (amount_minor > 0),
  constraint commercial_plan_versions_period check (billing_period in ('month', 'year')),
  constraint commercial_plan_versions_status check (status in ('draft', 'active', 'retired')),
  constraint commercial_plan_versions_capabilities_array check (jsonb_typeof(capabilities) = 'array'),
  constraint commercial_plan_versions_terms_length check (char_length(terms_version) between 1 and 40),
  constraint commercial_plan_versions_publish_state check (
    (status = 'draft' and published_at is null)
    or (status in ('active', 'retired') and published_at is not null)
  )
);

create unique index commercial_plan_versions_one_active
  on commercial_plan_versions(plan_id)
  where status = 'active';

create table payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete restrict,
  plan_version_id uuid not null references commercial_plan_versions(id) on delete restrict,
  provider text not null,
  status text not null default 'created',
  amount_minor integer not null,
  currency text not null,
  idempotency_key text not null,
  merchant_reference text not null,
  provider_reference text,
  checkout_expires_at timestamptz not null,
  completed_at timestamptz,
  failure_code text,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  unique (merchant_reference),
  constraint payment_orders_provider_allowed check (provider in ('jazzcash', 'sandbox')),
  constraint payment_orders_status_allowed check (
    status in ('created', 'pending', 'succeeded', 'failed', 'cancelled', 'expired', 'refunded')
  ),
  constraint payment_orders_amount check (amount_minor > 0),
  constraint payment_orders_currency check (currency = 'PKR'),
  constraint payment_orders_idempotency_length check (char_length(idempotency_key) between 12 and 128),
  constraint payment_orders_merchant_reference_format check (
    merchant_reference ~ '^SU[0-9]{14}[A-Z0-9]{8}$'
  ),
  constraint payment_orders_expiry check (checkout_expires_at > created_at),
  constraint payment_orders_completion check (
    (status in ('succeeded', 'refunded') and completed_at is not null)
    or (status not in ('succeeded', 'refunded'))
  )
);

create unique index payment_orders_provider_reference_unique
  on payment_orders(provider, provider_reference)
  where provider_reference is not null;

create index payment_orders_user_created_idx on payment_orders(user_id, created_at desc);
create index payment_orders_status_expiry_idx on payment_orders(status, checkout_expires_at);

create table payment_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references payment_orders(id) on delete restrict,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  provider_status text not null,
  signature_verified boolean not null,
  payload_digest text not null,
  received_at timestamptz not null default now(),
  unique (provider, provider_event_id),
  constraint payment_events_provider_allowed check (provider in ('jazzcash', 'sandbox')),
  constraint payment_events_type_allowed check (
    event_type in ('checkout_return', 'ipn', 'status_query', 'refund', 'manual_reconciliation')
  ),
  constraint payment_events_digest check (payload_digest ~ '^[a-f0-9]{64}$')
);

create index payment_events_order_idx on payment_events(order_id, received_at);

create table entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete restrict,
  plan_version_id uuid not null references commercial_plan_versions(id) on delete restrict,
  source_order_id uuid references payment_orders(id) on delete restrict,
  status text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  grace_ends_at timestamptz,
  cancelled_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entitlements_status_allowed check (
    status in ('active', 'grace', 'expired', 'cancelled', 'refunded', 'revoked')
  ),
  constraint entitlements_range check (ends_at > starts_at),
  constraint entitlements_grace_range check (grace_ends_at is null or grace_ends_at >= ends_at)
);

create unique index entitlements_source_order_unique
  on entitlements(source_order_id);

create index entitlements_user_status_idx on entitlements(user_id, status, ends_at desc);

create table entitlement_events (
  id uuid primary key default gen_random_uuid(),
  entitlement_id uuid not null references entitlements(id) on delete restrict,
  action text not null,
  actor_type text not null,
  actor_user_id uuid references users(id) on delete restrict,
  reason text not null,
  evidence_reference text,
  previous_status text,
  next_status text not null,
  created_at timestamptz not null default now(),
  constraint entitlement_events_action_allowed check (
    action in ('activate', 'extend', 'grace', 'expire', 'cancel', 'refund', 'revoke', 'reactivate', 'correct')
  ),
  constraint entitlement_events_actor_allowed check (actor_type in ('system', 'admin')),
  constraint entitlement_events_reason_length check (char_length(reason) between 3 and 500),
  constraint entitlement_events_status_values check (
    (previous_status is null or previous_status in ('active', 'grace', 'expired', 'cancelled', 'refunded', 'revoked'))
    and next_status in ('active', 'grace', 'expired', 'cancelled', 'refunded', 'revoked')
  )
);

create index entitlement_events_entitlement_idx on entitlement_events(entitlement_id, created_at);

create table reconciliation_cases (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references payment_orders(id) on delete restrict,
  mismatch_kind text not null,
  status text not null default 'open',
  provider_evidence jsonb not null default '{}'::jsonb,
  internal_evidence jsonb not null default '{}'::jsonb,
  resolution text,
  resolved_by uuid references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint reconciliation_cases_kind_allowed check (
    mismatch_kind in ('missing_internal', 'missing_provider', 'amount', 'currency', 'status', 'entitlement', 'duplicate')
  ),
  constraint reconciliation_cases_status_allowed check (status in ('open', 'resolved', 'ignored')),
  constraint reconciliation_cases_resolution_state check (
    (status = 'open' and resolved_at is null and resolved_by is null)
    or (status in ('resolved', 'ignored') and resolved_at is not null and resolved_by is not null)
  )
);

create unique index reconciliation_cases_open_unique
  on reconciliation_cases(order_id, mismatch_kind)
  where status = 'open';

create table admin_principals (
  user_id uuid primary key references users(id) on delete cascade,
  status text not null default 'active',
  created_by uuid references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  suspended_at timestamptz,
  constraint admin_principals_status_allowed check (status in ('active', 'suspended', 'revoked'))
);

create table admin_role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references admin_principals(user_id) on delete cascade,
  role text not null,
  assigned_by uuid references users(id) on delete restrict,
  reason text not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint admin_role_assignments_role_allowed check (
    role in (
      'content_editor',
      'content_reviewer',
      'publisher',
      'learner_support',
      'payment_operator',
      'analyst',
      'security_admin'
    )
  ),
  constraint admin_role_assignments_reason_length check (char_length(reason) between 3 and 500)
);

create unique index admin_role_assignments_active_unique
  on admin_role_assignments(user_id, role)
  where revoked_at is null;

create table privileged_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references users(id) on delete restrict,
  actor_role text,
  action text not null,
  target_type text not null,
  target_id text not null,
  result text not null,
  reason text,
  correlation_id text not null,
  release_sha text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint privileged_audit_events_result_allowed check (result in ('allowed', 'denied', 'succeeded', 'failed')),
  constraint privileged_audit_events_action_length check (char_length(action) between 3 and 120),
  constraint privileged_audit_events_target_length check (
    char_length(target_type) between 2 and 80 and char_length(target_id) between 1 and 200
  ),
  constraint privileged_audit_events_correlation_length check (char_length(correlation_id) between 1 and 128)
);

create index privileged_audit_events_actor_idx on privileged_audit_events(actor_user_id, created_at desc);
create index privileged_audit_events_target_idx on privileged_audit_events(target_type, target_id, created_at desc);

create table ai_generation_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references users(id) on delete restrict,
  task text not null,
  target_type text not null,
  target_id text,
  locale text not null default 'en',
  prompt_version text not null,
  status text not null default 'queued',
  requested_items integer not null default 1,
  provider text,
  model text,
  correlation_id text not null unique,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint ai_generation_requests_task_allowed check (
    task in (
      'generate_level',
      'generate_distractors',
      'generate_explanation',
      'summarize_content',
      'classify_difficulty',
      'evaluate_content',
      'translate_content'
    )
  ),
  constraint ai_generation_requests_locale_allowed check (locale in ('en', 'ur')),
  constraint ai_generation_requests_status_allowed check (
    status in ('queued', 'running', 'completed', 'failed', 'cancelled')
  ),
  constraint ai_generation_requests_requested_items check (requested_items between 1 and 100),
  constraint ai_generation_requests_correlation_length check (char_length(correlation_id) between 1 and 128)
);

create index ai_generation_requests_status_idx on ai_generation_requests(status, created_at);

create table ai_generated_artifacts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references ai_generation_requests(id) on delete restrict,
  artifact_type text not null,
  locale text not null,
  content_digest text not null,
  original_content jsonb not null,
  edited_content jsonb,
  validation_report jsonb not null default '{}'::jsonb,
  quality_score integer not null,
  quality_threshold integer not null,
  status text not null default 'draft',
  source_references jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_generated_artifacts_type_allowed check (
    artifact_type in ('path_outline', 'lesson', 'level', 'challenge', 'explanation', 'summary', 'metadata', 'translation')
  ),
  constraint ai_generated_artifacts_locale_allowed check (locale in ('en', 'ur')),
  constraint ai_generated_artifacts_digest check (content_digest ~ '^[a-f0-9]{64}$'),
  constraint ai_generated_artifacts_score check (
    quality_score between 0 and 100 and quality_threshold between 1 and 100
  ),
  constraint ai_generated_artifacts_status_allowed check (
    status in ('draft', 'held', 'in_review', 'approved', 'rejected', 'published', 'superseded')
  ),
  constraint ai_generated_artifacts_json_types check (
    jsonb_typeof(original_content) = 'object'
    and (edited_content is null or jsonb_typeof(edited_content) = 'object')
    and jsonb_typeof(validation_report) = 'object'
    and jsonb_typeof(source_references) = 'array'
  )
);

create unique index ai_generated_artifacts_request_digest_unique
  on ai_generated_artifacts(request_id, content_digest);

create index ai_generated_artifacts_review_queue_idx
  on ai_generated_artifacts(status, quality_score, created_at);

create table ai_artifact_reviews (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references ai_generated_artifacts(id) on delete restrict,
  reviewer_user_id uuid not null references admin_principals(user_id) on delete restrict,
  decision text not null,
  reason text not null,
  edited_content jsonb,
  created_at timestamptz not null default now(),
  constraint ai_artifact_reviews_decision_allowed check (
    decision in ('approve', 'reject', 'request_changes', 'escalate')
  ),
  constraint ai_artifact_reviews_reason_length check (char_length(reason) between 3 and 1000),
  constraint ai_artifact_reviews_edited_object check (
    edited_content is null or jsonb_typeof(edited_content) = 'object'
  )
);

create index ai_artifact_reviews_artifact_idx on ai_artifact_reviews(artifact_id, created_at);

create table ai_artifact_publications (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references ai_generated_artifacts(id) on delete restrict,
  published_target_type text not null,
  published_target_version_id uuid not null,
  published_by uuid not null references admin_principals(user_id) on delete restrict,
  published_at timestamptz not null default now(),
  rolled_back_by uuid references admin_principals(user_id) on delete restrict,
  rolled_back_at timestamptz,
  rollback_reason text,
  unique (artifact_id),
  constraint ai_artifact_publications_rollback_state check (
    (rolled_back_at is null and rolled_back_by is null and rollback_reason is null)
    or (
      rolled_back_at is not null
      and rolled_back_by is not null
      and char_length(rollback_reason) between 3 and 1000
    )
  )
);

create table commercial_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete restrict,
  event_name text not null,
  plan_code text,
  order_id uuid references payment_orders(id) on delete restrict,
  entitlement_id uuid references entitlements(id) on delete restrict,
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint commercial_events_name_allowed check (
    event_name in (
      'premium_offer_viewed',
      'checkout_started',
      'provider_handoff',
      'payment_pending',
      'payment_succeeded',
      'payment_failed',
      'entitlement_activated',
      'entitlement_expired',
      'entitlement_refunded',
      'reconciliation_opened'
    )
  ),
  constraint commercial_events_properties_object check (jsonb_typeof(properties) = 'object')
);

create index commercial_events_name_time_idx on commercial_events(event_name, occurred_at);

create or replace function reject_append_only_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'append-only table % cannot be updated or deleted', tg_table_name;
end;
$$;

create trigger payment_events_append_only
before update or delete on payment_events
for each row execute function reject_append_only_change();

create trigger entitlement_events_append_only
before update or delete on entitlement_events
for each row execute function reject_append_only_change();

create trigger privileged_audit_events_append_only
before update or delete on privileged_audit_events
for each row execute function reject_append_only_change();

create trigger ai_artifact_reviews_append_only
before update or delete on ai_artifact_reviews
for each row execute function reject_append_only_change();

create trigger commercial_events_append_only
before update or delete on commercial_events
for each row execute function reject_append_only_change();

create or replace function protect_ai_artifact_original()
returns trigger
language plpgsql
as $$
begin
  if new.original_content is distinct from old.original_content
    or new.content_digest is distinct from old.content_digest
    or new.request_id is distinct from old.request_id then
    raise exception 'AI artifact original output and identity are immutable';
  end if;
  if old.status in ('published', 'superseded') and new.status not in ('published', 'superseded') then
    raise exception 'published AI artifact state cannot be reversed in place';
  end if;
  return new;
end;
$$;

create trigger ai_generated_artifacts_immutable_original
before update on ai_generated_artifacts
for each row execute function protect_ai_artifact_original();

create or replace view active_commercial_plan_catalog as
select
  p.code,
  p.name,
  v.id as plan_version_id,
  v.version,
  v.currency,
  v.amount_minor,
  v.billing_period,
  v.capabilities,
  v.terms_version,
  v.published_at
from commercial_plans p
join commercial_plan_versions v on v.plan_id = p.id
where p.status = 'active' and v.status = 'active';

create or replace view active_user_capabilities as
select
  e.user_id,
  e.id as entitlement_id,
  p.code as plan_code,
  e.status,
  e.starts_at,
  e.ends_at,
  e.grace_ends_at,
  v.capabilities
from entitlements e
join commercial_plan_versions v on v.id = e.plan_version_id
join commercial_plans p on p.id = v.plan_id
where e.status in ('active', 'grace')
  and now() >= e.starts_at
  and now() < coalesce(e.grace_ends_at, e.ends_at);

insert into commercial_plans (id, code, name, status)
values
  ('a1000000-0000-4000-8000-000000000001', 'premium-monthly', 'SkillUp Premium Monthly', 'active'),
  ('a1000000-0000-4000-8000-000000000002', 'premium-yearly', 'SkillUp Premium Yearly', 'active')
on conflict (code) do nothing;

insert into commercial_plan_versions (
  id,
  plan_id,
  version,
  currency,
  amount_minor,
  billing_period,
  status,
  capabilities,
  terms_version,
  published_at
)
values
  (
    'a2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    1,
    'PKR',
    59900,
    'month',
    'active',
    '["expanded_levels","detailed_progress","advanced_ai_challenges","premium_avatars"]'::jsonb,
    'launch-v1',
    now()
  ),
  (
    'a2000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000002',
    1,
    'PKR',
    499900,
    'year',
    'active',
    '["expanded_levels","detailed_progress","advanced_ai_challenges","premium_avatars"]'::jsonb,
    'launch-v1',
    now()
  )
on conflict (plan_id, version) do nothing;
