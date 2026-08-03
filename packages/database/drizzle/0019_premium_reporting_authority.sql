-- SkillUp Premium administration and reporting authority.
-- Reporting boundaries use Asia/Karachi while all persisted timestamps remain timestamptz/UTC.

alter table payment_orders
  add column payment_purpose text not null default 'activation';

alter table payment_orders
  add constraint payment_orders_purpose_allowed
    check (payment_purpose in ('activation', 'renewal', 'reactivation'));

create or replace function classify_payment_order_purpose()
returns trigger
language plpgsql
as $$
declare
  previous_end timestamptz;
begin
  select max(e.ends_at)
    into previous_end
    from entitlements e
   where e.user_id = new.user_id
     and e.source_order_id is not null;

  if previous_end is null then
    new.payment_purpose := 'activation';
  elsif previous_end >= new.created_at then
    new.payment_purpose := 'renewal';
  else
    new.payment_purpose := 'reactivation';
  end if;
  return new;
end;
$$;

create trigger payment_orders_classify_purpose
before insert on payment_orders
for each row execute function classify_payment_order_purpose();

with ranked as (
  select id,
         row_number() over (partition by user_id order by created_at, id) as sequence,
         lag(created_at) over (partition by user_id order by created_at, id) as previous_created
    from payment_orders
)
update payment_orders po
   set payment_purpose = case
     when r.sequence = 1 then 'activation'
     when exists (
       select 1
         from entitlements e
        where e.user_id = po.user_id
          and e.created_at <= po.created_at
          and e.ends_at >= po.created_at
     ) then 'renewal'
     else 'reactivation'
   end
  from ranked r
 where r.id = po.id;

create table payment_financial_effects (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references payment_orders(id) on delete restrict,
  provider_event_id uuid references payment_events(id) on delete restrict,
  effect_type text not null,
  status text not null,
  amount_minor integer not null,
  currency text not null,
  provider text not null,
  provider_reference text,
  payload_digest text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (order_id, effect_type),
  constraint payment_financial_effects_type_allowed
    check (effect_type in ('capture', 'refund', 'reversal')),
  constraint payment_financial_effects_status_allowed
    check (status in ('completed', 'failed', 'cancelled')),
  constraint payment_financial_effects_amount_positive check (amount_minor > 0),
  constraint payment_financial_effects_currency check (currency = 'PKR'),
  constraint payment_financial_effects_provider_allowed check (provider in ('jazzcash', 'sandbox')),
  constraint payment_financial_effects_digest_format
    check (payload_digest is null or payload_digest ~ '^[a-f0-9]{64}$')
);

create index payment_financial_effects_occurred_idx
  on payment_financial_effects(occurred_at desc, effect_type, status);
create index payment_financial_effects_order_idx
  on payment_financial_effects(order_id, occurred_at desc);

create or replace function record_payment_financial_effect()
returns trigger
language plpgsql
as $$
declare
  latest_event_id uuid;
  latest_digest text;
begin
  select pe.id, pe.payload_digest
    into latest_event_id, latest_digest
    from payment_events pe
   where pe.order_id = new.id
   order by pe.received_at desc, pe.id desc
   limit 1;

  if new.status in ('succeeded', 'refunded')
     and (tg_op = 'INSERT' or old.status not in ('succeeded', 'refunded')) then
    insert into payment_financial_effects (
      order_id, provider_event_id, effect_type, status, amount_minor, currency,
      provider, provider_reference, payload_digest, occurred_at
    )
    values (
      new.id, latest_event_id, 'capture', 'completed', new.amount_minor, new.currency,
      new.provider, new.provider_reference, latest_digest, coalesce(new.completed_at, new.updated_at)
    )
    on conflict (order_id, effect_type) do nothing;
  end if;

  if new.status = 'refunded'
     and (tg_op = 'INSERT' or old.status <> 'refunded') then
    insert into payment_financial_effects (
      order_id, provider_event_id, effect_type, status, amount_minor, currency,
      provider, provider_reference, payload_digest, occurred_at
    )
    values (
      new.id, latest_event_id, 'refund', 'completed', new.amount_minor, new.currency,
      new.provider, new.provider_reference, latest_digest, new.updated_at
    )
    on conflict (order_id, effect_type) do nothing;
  end if;
  return new;
end;
$$;

create trigger payment_orders_financial_effects
  after insert or update of status, completed_at, provider_reference on payment_orders
  for each row execute function record_payment_financial_effect();

insert into payment_financial_effects (
  order_id, provider_event_id, effect_type, status, amount_minor, currency,
  provider, provider_reference, payload_digest, occurred_at
)
select po.id,
       latest_event.id,
       'capture',
       'completed',
       po.amount_minor,
       po.currency,
       po.provider,
       po.provider_reference,
       latest_event.payload_digest,
       coalesce(po.completed_at, po.updated_at)
  from payment_orders po
  left join lateral (
    select pe.id, pe.payload_digest
      from payment_events pe
     where pe.order_id = po.id
     order by pe.received_at desc, pe.id desc
     limit 1
  ) latest_event on true
 where po.status in ('succeeded', 'refunded')
on conflict (order_id, effect_type) do nothing;

insert into payment_financial_effects (
  order_id, provider_event_id, effect_type, status, amount_minor, currency,
  provider, provider_reference, payload_digest, occurred_at
)
select po.id,
       latest_event.id,
       'refund',
       'completed',
       po.amount_minor,
       po.currency,
       po.provider,
       po.provider_reference,
       latest_event.payload_digest,
       po.updated_at
  from payment_orders po
  left join lateral (
    select pe.id, pe.payload_digest
      from payment_events pe
     where pe.order_id = po.id
     order by pe.received_at desc, pe.id desc
     limit 1
  ) latest_event on true
 where po.status = 'refunded'
on conflict (order_id, effect_type) do nothing;

create table membership_periods (
  id uuid primary key default gen_random_uuid(),
  entitlement_id uuid not null unique references entitlements(id) on delete restrict,
  user_id uuid not null references users(id) on delete restrict,
  plan_version_id uuid not null references commercial_plan_versions(id) on delete restrict,
  source_order_id uuid references payment_orders(id) on delete restrict,
  previous_period_id uuid references membership_periods(id) on delete restrict,
  origin text not null,
  purpose text not null,
  status text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  grace_end timestamptz,
  renewal_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_periods_origin_allowed check (origin in ('paid', 'manual_grant')),
  constraint membership_periods_purpose_allowed
    check (purpose in ('activation', 'renewal', 'reactivation', 'manual_grant')),
  constraint membership_periods_status_allowed
    check (status in ('active', 'grace', 'expired', 'cancelled', 'refunded', 'revoked')),
  constraint membership_periods_range check (period_end > period_start),
  constraint membership_periods_grace_range check (grace_end is null or grace_end >= period_end),
  constraint membership_periods_origin_source check (
    (origin = 'paid' and source_order_id is not null and purpose <> 'manual_grant')
    or (origin = 'manual_grant' and source_order_id is null and purpose = 'manual_grant')
  )
);

create index membership_periods_user_time_idx
  on membership_periods(user_id, period_start desc, id desc);
create index membership_periods_status_end_idx
  on membership_periods(status, period_end, plan_version_id);
create index membership_periods_renewal_due_idx
  on membership_periods(renewal_due_at, status)
  where renewal_due_at is not null;
create index membership_periods_purpose_time_idx
  on membership_periods(purpose, period_start desc, origin);

create or replace function create_membership_period()
returns trigger
language plpgsql
as $$
declare
  previous_id uuid;
  classified_purpose text;
  classified_origin text;
begin
  select mp.id
    into previous_id
    from membership_periods mp
   where mp.user_id = new.user_id
   order by mp.period_start desc, mp.id desc
   limit 1;

  if new.source_order_id is null then
    classified_origin := 'manual_grant';
    classified_purpose := 'manual_grant';
  else
    classified_origin := 'paid';
    select po.payment_purpose
      into classified_purpose
      from payment_orders po
     where po.id = new.source_order_id;
    classified_purpose := coalesce(classified_purpose, case when previous_id is null then 'activation' else 'renewal' end);
  end if;

  insert into membership_periods (
    entitlement_id, user_id, plan_version_id, source_order_id, previous_period_id,
    origin, purpose, status, period_start, period_end, grace_end, renewal_due_at,
    created_at, updated_at
  )
  values (
    new.id, new.user_id, new.plan_version_id, new.source_order_id, previous_id,
    classified_origin, classified_purpose, new.status, new.starts_at, new.ends_at,
    new.grace_ends_at, case when classified_origin = 'paid' then new.ends_at else null end,
    new.created_at, new.updated_at
  )
  on conflict (entitlement_id) do nothing;
  return new;
end;
$$;

create trigger entitlements_create_membership_period
  after insert on entitlements
  for each row execute function create_membership_period();

create or replace function sync_membership_period()
returns trigger
language plpgsql
as $$
begin
  update membership_periods
     set status = new.status,
         period_start = new.starts_at,
         period_end = new.ends_at,
         grace_end = new.grace_ends_at,
         renewal_due_at = case when origin = 'paid' then new.ends_at else null end,
         updated_at = new.updated_at
   where entitlement_id = new.id;
  return new;
end;
$$;

create trigger entitlements_sync_membership_period
  after update of status, starts_at, ends_at, grace_ends_at, updated_at on entitlements
  for each row execute function sync_membership_period();

with ordered as (
  select e.*,
         row_number() over (partition by e.user_id order by e.starts_at, e.id) as sequence,
         lag(e.id) over (partition by e.user_id order by e.starts_at, e.id) as previous_entitlement_id
    from entitlements e
), mapped as (
  select o.*,
         previous_mp.id as previous_period_id,
         po.payment_purpose
    from ordered o
    left join membership_periods previous_mp on previous_mp.entitlement_id = o.previous_entitlement_id
    left join payment_orders po on po.id = o.source_order_id
)
insert into membership_periods (
  entitlement_id, user_id, plan_version_id, source_order_id, previous_period_id,
  origin, purpose, status, period_start, period_end, grace_end, renewal_due_at,
  created_at, updated_at
)
select id,
       user_id,
       plan_version_id,
       source_order_id,
       previous_period_id,
       case when source_order_id is null then 'manual_grant' else 'paid' end,
       case
         when source_order_id is null then 'manual_grant'
         when sequence = 1 then 'activation'
         else coalesce(payment_purpose, 'renewal')
       end,
       status,
       starts_at,
       ends_at,
       grace_ends_at,
       case when source_order_id is null then null else ends_at end,
       created_at,
       updated_at
  from mapped
on conflict (entitlement_id) do nothing;

alter table admin_exports
  add column schema_version text not null default 'premium-report-v1',
  add column filename text,
  add column content_type text,
  add column generated_at timestamptz;

alter table admin_exports
  add constraint admin_exports_filename_length
    check (filename is null or char_length(filename) between 5 and 180),
  add constraint admin_exports_content_type_length
    check (content_type is null or char_length(content_type) between 3 and 120),
  add constraint admin_exports_schema_version_length
    check (char_length(schema_version) between 3 and 80);

create table admin_export_payloads (
  export_id uuid primary key references admin_exports(id) on delete cascade,
  payload bytea not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint admin_export_payloads_size check (octet_length(payload) between 1 and 10485760)
);

create index admin_exports_type_created_idx
  on admin_exports(export_type, created_at desc);
create index reconciliation_cases_status_created_idx
  on reconciliation_cases(status, mismatch_kind, created_at desc);
create index payment_orders_reporting_idx
  on payment_orders(created_at desc, status, payment_purpose, plan_version_id, user_id);

create or replace function reject_financial_effect_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'payment financial effects are append-only';
end;
$$;

create trigger payment_financial_effects_append_only
before update or delete on payment_financial_effects
for each row execute function reject_financial_effect_change();
