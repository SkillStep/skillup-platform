-- Replace the active monthly Premium plan with the approved PKR 990 price.
-- Existing plan versions, orders, and entitlements remain immutable historical records.

update commercial_plan_versions
   set status = 'retired',
       retired_at = now()
 where id = 'a2000000-0000-4000-8000-000000000001'
   and status = 'active';

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
  published_at,
  effective_at
)
values (
  'a2000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000001',
  2,
  'PKR',
  99000,
  'month',
  'active',
  '["expanded_levels","detailed_progress","advanced_ai_challenges","premium_avatars"]'::jsonb,
  'launch-v1',
  now(),
  now()
)
on conflict (plan_id, version) do nothing;
