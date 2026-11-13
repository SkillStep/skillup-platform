-- Verified SkillUp JazzCash settlements -> GrowthOS canonical conversion relay.
-- No payments, entitlements, provider credentials, or historical events are changed.
-- Enqueue only when GrowthOS bridge is explicitly enabled by the API operator.
create table if not exists growthos_conversion_outbox (
  order_id uuid primary key references payment_orders(id) on delete restrict,
  status text not null default 'pending',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  delivered_at timestamptz,
  last_http_status integer,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint growthos_conversion_outbox_state check (status in ('pending', 'processing', 'delivered', 'blocked', 'failed')),
  constraint growthos_conversion_outbox_attempts check (attempts between 0 and 5),
  constraint growthos_conversion_outbox_last_code check (last_error_code is null or char_length(last_error_code) <= 64)
);
create index if not exists growthos_conversion_outbox_due_idx
  on growthos_conversion_outbox(status, available_at, lease_expires_at)
  where status in ('pending', 'processing');
