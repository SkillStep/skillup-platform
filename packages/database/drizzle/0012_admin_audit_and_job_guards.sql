alter table admin_principals
  add column updated_at timestamptz not null default now();

alter table admin_role_assignments
  add column granted_by uuid references users(id) on delete restrict,
  add column granted_at timestamptz not null default now(),
  add column revoked_by uuid references users(id) on delete restrict,
  add column revocation_reason text;

update admin_role_assignments
   set granted_by = assigned_by,
       granted_at = created_at
 where granted_by is null;

alter table admin_role_assignments
  add constraint admin_role_assignments_revocation_reason_length
    check (revocation_reason is null or char_length(revocation_reason) between 3 and 500),
  add constraint admin_role_assignments_revocation_state
    check (
      (revoked_at is null and revoked_by is null and revocation_reason is null)
      or (revoked_at is not null and revoked_by is not null and revocation_reason is not null)
    );

create unique index commercial_jobs_active_order_unique
  on commercial_jobs(job_type, order_id)
  where order_id is not null and status in ('queued', 'running');

create unique index commercial_jobs_active_entitlement_unique
  on commercial_jobs(job_type, entitlement_id)
  where entitlement_id is not null and status in ('queued', 'running');
