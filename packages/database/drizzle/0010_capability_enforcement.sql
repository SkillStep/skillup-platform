-- Server-authoritative capability enforcement.

create or replace function skillup_has_active_premium(p_user_id uuid, p_at timestamptz)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
      from entitlements e
     where e.user_id = p_user_id
       and e.status in ('active', 'grace')
       and e.starts_at <= p_at
       and coalesce(e.grace_ends_at, e.ends_at) > p_at
  );
$$;

create or replace function skillup_sync_progress_tier(p_user_id uuid, p_at timestamptz)
returns void
language plpgsql
as $$
begin
  insert into learner_progress_settings
    (user_id, timezone, tier, leaderboard_opt_in, leaderboard_alias, leaderboard_status)
  values
    (p_user_id, 'UTC', case when skillup_has_active_premium(p_user_id, p_at) then 'premium' else 'free' end,
     false, 'Learner-' || substr(encode(digest('skillup-leaderboard:' || p_user_id::text, 'sha256'), 'hex'), 1, 10), 'eligible')
  on conflict (user_id) do update
    set tier = excluded.tier;
end;
$$;

create or replace function skillup_entitlement_sync_trigger()
returns trigger
language plpgsql
as $$
begin
  perform skillup_sync_progress_tier(coalesce(new.user_id, old.user_id), now());
  return coalesce(new, old);
end;
$$;

create trigger entitlements_sync_progress_tier_after_change
after insert or update of status, starts_at, ends_at, grace_ends_at, revoked_at, cancelled_at
after? on entitlements;
