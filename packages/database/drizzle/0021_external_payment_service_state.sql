-- Durable state for SkillUp's external payment-service integration.
-- Provider tokens, API keys, webhook secrets and JazzCash credentials are never stored here.

create table payment_service_webhook_events (
  event_id text primary key,
  event_type text not null,
  user_id uuid not null references users(id) on delete restrict,
  event_created_at timestamptz not null,
  payload_digest text not null,
  signature_verified boolean not null default true,
  processing_status text not null default 'received',
  error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint payment_service_webhook_event_id_length check (char_length(event_id) between 1 and 200),
  constraint payment_service_webhook_event_type_length check (char_length(event_type) between 3 and 120),
  constraint payment_service_webhook_digest check (payload_digest ~ '^[a-f0-9]{64}$'),
  constraint payment_service_webhook_status_allowed check (
    processing_status in ('received', 'processed', 'ignored_stale', 'failed')
  ),
  constraint payment_service_webhook_processing_state check (
    (processing_status = 'received' and processed_at is null)
    or (processing_status <> 'received' and processed_at is not null)
  )
);

create index payment_service_webhook_user_created_idx
  on payment_service_webhook_events(user_id, event_created_at desc);

create table payment_service_subscription_state (
  user_id uuid primary key references users(id) on delete restrict,
  external_subscription_id text,
  external_plan_code text,
  subscription_status text,
  wallet_status text not null default 'none',
  wallet_msisdn_masked text,
  current_period_paid boolean not null default false,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  next_due_at timestamptz,
  last_payment_status text,
  entitlement_id uuid references entitlements(id) on delete restrict,
  last_event_created_at timestamptz,
  last_synced_at timestamptz not null default now(),
  constraint payment_service_subscription_id_length check (
    external_subscription_id is null or char_length(external_subscription_id) between 1 and 256
  ),
  constraint payment_service_plan_code_length check (
    external_plan_code is null or char_length(external_plan_code) between 1 and 64
  ),
  constraint payment_service_subscription_status_allowed check (
    subscription_status is null
    or subscription_status in (
      'initiated', 'trialing', 'active', 'past_due', 'paused', 'payment_failed', 'expired', 'canceled'
    )
  ),
  constraint payment_service_wallet_status_allowed check (
    wallet_status in ('none', 'pending', 'linked', 'unlinked', 'failed')
  ),
  constraint payment_service_payment_status_allowed check (
    last_payment_status is null
    or last_payment_status in ('pending', 'completed', 'failed', 'expired', 'refunded')
  )
);

create unique index payment_service_subscription_external_unique
  on payment_service_subscription_state(external_subscription_id)
  where external_subscription_id is not null;

create index payment_service_subscription_status_idx
  on payment_service_subscription_state(subscription_status, current_period_end);
