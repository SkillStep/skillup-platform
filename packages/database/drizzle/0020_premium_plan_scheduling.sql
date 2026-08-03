-- Scheduled Premium plan activation and complete report export types.

alter table commercial_plan_versions
  add column effective_at timestamptz;

update commercial_plan_versions
   set effective_at = published_at
 where status in ('active', 'retired')
   and effective_at is null;

alter table commercial_plan_versions
  add constraint commercial_plan_versions_effective_state check (
    (status = 'draft')
    or (status in ('active', 'retired') and effective_at is not null)
  );

create index commercial_plan_versions_due_idx
  on commercial_plan_versions(status, effective_at)
  where status = 'draft' and effective_at is not null;

alter table admin_exports
  drop constraint admin_exports_type_allowed;

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
      'reconciliation'
    )
  );

with ordered as (
  select id,
         lag(id) over (partition by user_id order by period_start, id) as previous_id
    from membership_periods
)
update membership_periods mp
   set previous_period_id = ordered.previous_id
  from ordered
 where ordered.id = mp.id
   and mp.previous_period_id is null
   and ordered.previous_id is not null;
