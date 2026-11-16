-- Certificate data/evidence foundation; migrations never issue certificates.
-- Complete policy and independent human sign-off required before any policy activates.
create table skill_completion_requirement_sets (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references skills(id) on delete restrict,
  skill_version_id uuid not null references skill_versions(id) on delete restrict,
  requirement_version integer not null check (requirement_version >= 1),
  level_version_ids uuid[] not null check (cardinality(level_version_ids) >= 1),
  challenge_version_ids uuid[] not null check (cardinality(challenge_version_ids) >= 1),
  content_digest text not null check (content_digest ~ '^[0-9a-f]{64}$'),
  minimum_pass_percent integer check (minimum_pass_percent between 1 and 100),
  required_capstone boolean not null default true,
  retries_allowed boolean,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'retired')),
  approved_by uuid references users(id) on delete restrict,
  approved_at timestamptz,
  approval_reason text,
  created_at timestamptz not null default now(),
  unique(skill_id, requirement_version),
  unique(id, skill_id),
  constraint certificate_policy_activation_evidence check (
    status <> 'active' or (
      approved_by is not null
      and approved_at is not null
      and approval_reason is not null
      and char_length(approval_reason) between 12 and 1500
      and minimum_pass_percent is not null
      and retries_allowed is not null
    )
  )
);
create unique index skill_completion_one_active_set
  on skill_completion_requirement_sets(skill_id) where status = 'active';
create index skill_completion_requirements_version
  on skill_completion_requirement_sets(skill_version_id, status);

create table skill_capstone_attestations (
  id uuid primary key default gen_random_uuid(),
  requirement_set_id uuid not null references skill_completion_requirement_sets(id) on delete restrict,
  user_id uuid not null references users(id) on delete cascade,
  reviewer_user_id uuid not null references users(id) on delete restrict,
  decision text not null check(decision in ('passed','failed')),
  evidence_digest text not null check(evidence_digest ~ '^[0-9a-f]{64}$'),
  reason text not null check(char_length(reason) between 12 and 1500),
  verified_at timestamptz not null default now(),
  unique(requirement_set_id, user_id, evidence_digest),
  constraint capstone_distinct_reviewer check (user_id <> reviewer_user_id)
);
create index skill_capstone_by_user on skill_capstone_attestations(user_id, requirement_set_id, verified_at);

create table skill_certificate_awards (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique
    check(public_id ~ '^SC-[A-Za-z0-9_-]{26,64}$'),
  user_id uuid not null references users(id) on delete cascade,
  skill_id uuid not null references skills(id) on delete restrict,
  requirement_set_id uuid not null references skill_completion_requirement_sets(id) on delete restrict,
  certificate_title text not null check(char_length(certificate_title) between 20 and 180),
  learner_name text not null check(char_length(learner_name) between 2 and 80),
  evidence_digest text not null check(evidence_digest ~ '^[0-9a-f]{64}$'),
  completed_at timestamptz not null,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references users(id) on delete restrict,
  revocation_reason text,
  unique(user_id, skill_id, requirement_set_id),
  foreign key (requirement_set_id, skill_id)
    references skill_completion_requirement_sets(id, skill_id) on delete restrict,
  constraint certificate_revocation_metadata check (
    (revoked_at is null and revoked_by is null and revocation_reason is null) or
    (revoked_at is not null and revoked_by is not null
       and revocation_reason is not null
       and char_length(revocation_reason) between 12 and 1500)
  )
);
create index skill_certificate_user_history on skill_certificate_awards(user_id, issued_at desc);

create table skill_certificate_events (
  id bigint generated always as identity primary key,
  award_id uuid references skill_certificate_awards(id) on delete set null,
  actor_user_id uuid references users(id) on delete set null,
  action text not null check(action in ('issued','revoked','verified_download')),
  reason text not null check(char_length(reason) between 12 and 1500),
  event_digest text not null check(event_digest ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz not null default now()
);
create index skill_certificate_event_history on skill_certificate_events(award_id, occurred_at, id);

-- Never change a frozen requirement set after approval; to change policy,
-- create a new requirement version and retire the old one.
create function protect_skill_completion_policy() returns trigger
language plpgsql as $$
begin
  if old.status = 'active' and
     (row(old.id, old.skill_id, old.skill_version_id, old.requirement_version,
          old.level_version_ids, old.challenge_version_ids, old.content_digest,
          old.minimum_pass_percent, old.required_capstone, old.retries_allowed,
          old.approved_by, old.approved_at, old.approval_reason)
      is distinct from
      row(new.id, new.skill_id, new.skill_version_id, new.requirement_version,
          new.level_version_ids, new.challenge_version_ids, new.content_digest,
          new.minimum_pass_percent, new.required_capstone, new.retries_allowed,
          new.approved_by, new.approved_at, new.approval_reason)) then
    raise exception 'Approved completion requirements are immutable';
  end if;
  if old.status = 'retired' then
    raise exception 'Retired completion requirements cannot be reactivated or rewritten';
  end if;
  return new;
end;
$$;
create trigger protect_skill_completion_policy_update
  before update on skill_completion_requirement_sets
  for each row execute function protect_skill_completion_policy();

-- Preserve issue-date, learner name and completion evidence. A separate
-- approved administrative revocation may fill the revocation columns.
create function protect_skill_certificate_award() returns trigger
language plpgsql as $$
begin
  if row(old.id, old.public_id, old.user_id, old.skill_id, old.requirement_set_id,
         old.certificate_title, old.learner_name, old.evidence_digest,
         old.completed_at, old.issued_at)
     is distinct from
     row(new.id, new.public_id, new.user_id, new.skill_id, new.requirement_set_id,
         new.certificate_title, new.learner_name, new.evidence_digest,
         new.completed_at, new.issued_at) then
    raise exception 'Issued certificate evidence is immutable';
  end if;
  if old.revoked_at is not null and new is distinct from old then
    raise exception 'Revoked certificate cannot be rewritten';
  end if;
  return new;
end;
$$;
create trigger protect_skill_certificate_award_update
  before update on skill_certificate_awards
  for each row execute function protect_skill_certificate_award();

create function forbid_skill_certificate_evidence_rewrite() returns trigger
language plpgsql as $$
begin
  raise exception 'Certificate reviewer and event evidence is append-only';
end;
$$;
create trigger skill_capstone_attestations_append_only before update or delete
  on skill_capstone_attestations for each row
  execute function forbid_skill_certificate_evidence_rewrite();
create trigger skill_certificate_events_append_only before update or delete
  on skill_certificate_events for each row
  execute function forbid_skill_certificate_evidence_rewrite();

-- A direct DB insert would still be privileged: the award engine itself
-- rechecks real server attempts, full content publication and capstone.
