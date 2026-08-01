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

create or replace function skillup_force_progress_tier_trigger()
returns trigger
language plpgsql
as $$
begin
  new.tier := case
    when skillup_has_active_premium(new.user_id, now()) then 'premium'
    else 'free'
  end;
  return new;
end;
$$;

create trigger learner_progress_settings_force_derived_tier
before insert or update of tier on learner_progress_settings
for each row execute function skillup_force_progress_tier_trigger();

create or replace function skillup_sync_progress_tier(p_user_id uuid, p_at timestamptz)
returns void
language plpgsql
as $$
begin
  insert into learner_progress_settings
    (user_id, timezone, tier, leaderboard_opt_in, leaderboard_alias, leaderboard_status)
  values
    (
      p_user_id,
      'UTC',
      case when skillup_has_active_premium(p_user_id, p_at) then 'premium' else 'free' end,
      false,
      'Learner-' || substr(
        encode(
          digest(('skillup-leaderboard:' || p_user_id::text)::text, 'sha256'::text),
          'hex'::text
        ),
        1,
        10
      ),
      'eligible'
    )
  on conflict (user_id) do update
    set tier = excluded.tier;
end;
$$;

create or replace function skillup_entitlement_sync_trigger()
returns trigger
language plpgsql
as $$
declare
  affected_user_id uuid;
begin
  affected_user_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  perform skillup_sync_progress_tier(affected_user_id, now());
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger entitlements_sync_progress_tier_after_write
after insert or update of status, starts_at, ends_at, grace_ends_at, revoked_at, cancelled_at
on entitlements
for each row execute function skillup_entitlement_sync_trigger();

create trigger entitlements_sync_progress_tier_after_delete
after delete on entitlements
for each row execute function skillup_entitlement_sync_trigger();

create or replace function skillup_enforce_mission_allowance_trigger()
returns trigger
language plpgsql
as $$
declare
  updated_count integer;
begin
  if skillup_has_active_premium(new.user_id, new.started_at) then
    return new;
  end if;

  insert into learner_daily_mission_usage
    (user_id, usage_date, missions_started, last_session_id, updated_at)
  values
    (new.user_id, (new.started_at at time zone 'UTC')::date, 1, null, new.started_at)
  on conflict (user_id, usage_date) do update
    set missions_started = learner_daily_mission_usage.missions_started + 1,
        updated_at = excluded.updated_at
  where learner_daily_mission_usage.missions_started < 3
  returning missions_started into updated_count;

  if updated_count is null then
    raise exception using
      errcode = 'P0001',
      message = 'daily_free_mission_limit_reached';
  end if;

  return new;
end;
$$;

create trigger level_play_sessions_enforce_mission_allowance
before insert on level_play_sessions
for each row execute function skillup_enforce_mission_allowance_trigger();

create or replace function skillup_link_mission_usage_session_trigger()
returns trigger
language plpgsql
as $$
begin
  if not skillup_has_active_premium(new.user_id, new.started_at) then
    update learner_daily_mission_usage
       set last_session_id = new.id,
           updated_at = new.started_at
     where user_id = new.user_id
       and usage_date = (new.started_at at time zone 'UTC')::date;
  end if;
  return new;
end;
$$;

create trigger level_play_sessions_link_mission_usage
after insert on level_play_sessions
for each row execute function skillup_link_mission_usage_session_trigger();
