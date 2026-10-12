-- Campaign attribution for Premium UTM reporting (last-touch on user + intent + payment).
-- Source of truth for Subs reports is payment_orders with status = succeeded and stored attribution.

alter table users
  add column if not exists premium_attribution jsonb not null default '{}'::jsonb;

alter table users
  drop constraint if exists users_premium_attribution_object;
alter table users
  add constraint users_premium_attribution_object check (jsonb_typeof(premium_attribution) = 'object');

alter table jazzcash_wallet_link_intents
  add column if not exists attribution jsonb not null default '{}'::jsonb;

alter table jazzcash_wallet_link_intents
  drop constraint if exists jazzcash_wallet_link_intents_attribution_object;
alter table jazzcash_wallet_link_intents
  add constraint jazzcash_wallet_link_intents_attribution_object
  check (jsonb_typeof(attribution) = 'object');

alter table payment_orders
  add column if not exists attribution jsonb not null default '{}'::jsonb;

alter table payment_orders
  drop constraint if exists payment_orders_attribution_object;
alter table payment_orders
  add constraint payment_orders_attribution_object check (jsonb_typeof(attribution) = 'object');

create index if not exists payment_orders_attribution_platform_idx
  on payment_orders (
    (coalesce(attribution->>'utm', attribution->>'utm_source')),
    (attribution->>'package'),
    (attribution->>'parameter')
  )
  where status = 'succeeded';

alter table admin_exports
  drop constraint if exists admin_exports_type_allowed;

alter table admin_exports
  add constraint admin_exports_type_allowed check (
    export_type in (
      'analytics',
      'payments',
      'content',
      'support',
      'audit',
      'summary',
      'memberships',
      'recurring_customers',
      'reconciliation',
      'campaign_attribution'
    )
  );
