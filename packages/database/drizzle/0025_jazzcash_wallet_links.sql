-- JazzCash MWALLET recurring: store linked wallet payment tokens (server-side only).

create table if not exists jazzcash_wallet_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  msisdn text not null,
  payment_token text not null,
  request_id text not null,
  status text not null default 'active',
  plan_code text,
  linked_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jazzcash_wallet_links_status_allowed check (status in ('pending', 'active', 'revoked', 'failed')),
  constraint jazzcash_wallet_links_msisdn_digits check (msisdn ~ '^[0-9]{11,15}$'),
  constraint jazzcash_wallet_links_request_id_length check (char_length(request_id) between 8 and 64),
  constraint jazzcash_wallet_links_token_length check (char_length(payment_token) between 8 and 512)
);

create unique index if not exists jazzcash_wallet_links_request_id_unique
  on jazzcash_wallet_links(request_id);

create unique index if not exists jazzcash_wallet_links_active_user_unique
  on jazzcash_wallet_links(user_id)
  where status = 'active';

create index if not exists jazzcash_wallet_links_user_status_idx
  on jazzcash_wallet_links(user_id, status, linked_at desc);

create table if not exists jazzcash_wallet_link_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  plan_code text not null,
  msisdn text not null,
  request_id text not null,
  idempotency_key text not null,
  status text not null default 'pending',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jazzcash_wallet_link_intents_status_allowed check (
    status in ('pending', 'completed', 'expired', 'failed')
  ),
  constraint jazzcash_wallet_link_intents_plan_allowed check (
    plan_code in ('premium-monthly', 'premium-yearly')
  ),
  constraint jazzcash_wallet_link_intents_msisdn_digits check (msisdn ~ '^[0-9]{11,15}$')
);

create unique index if not exists jazzcash_wallet_link_intents_request_id_unique
  on jazzcash_wallet_link_intents(request_id);

create unique index if not exists jazzcash_wallet_link_intents_user_idempotency_unique
  on jazzcash_wallet_link_intents(user_id, idempotency_key);
