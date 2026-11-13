-- Draft-only SkillUp human editorial approvals. No synthetic sign-offs or publication.
create table course_editorial_submissions (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references skills(id) on delete restrict,
  path_id uuid not null references learning_paths(id) on delete restrict,
  content_digest text not null check (content_digest ~ '^[0-9a-f]{64}$'),
  version_manifest jsonb not null check (jsonb_typeof(version_manifest) = 'object'),
  submitted_by uuid not null references users(id) on delete restrict,
  reason text not null check (char_length(reason) between 12 and 1000),
  status text not null default 'submitted' check
    (status in ('submitted', 'changes_requested', 'approved', 'published', 'superseded', 'withdrawn')),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid references users(id) on delete restrict,
  constraint course_editorial_published_identity check
    ((status not in ('published', 'superseded', 'withdrawn')) or (published_at is not null and published_by is not null))
);
create unique index course_editorial_one_active_submission
  on course_editorial_submissions(skill_id) where status in ('submitted', 'approved');
create index course_editorial_skill_history on course_editorial_submissions(skill_id, submitted_at desc);
create index course_editorial_review_queue on course_editorial_submissions(status, submitted_at);

create table course_editorial_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references course_editorial_submissions(id) on delete restrict,
  review_kind text not null check (review_kind in ('subject', 'accessibility')),
  decision text not null check (decision in ('approve', 'request_changes')),
  reviewer_user_id uuid not null references users(id) on delete restrict,
  content_digest text not null check (content_digest ~ '^[0-9a-f]{64}$'),
  checklist jsonb not null check (jsonb_typeof(checklist) = 'object'),
  reason text not null check (char_length(reason) between 12 and 1500),
  created_at timestamptz not null default now(),
  unique (submission_id, review_kind)
);
create index course_editorial_reviews_submission on course_editorial_reviews(submission_id);

create table course_editorial_events (
  id bigint generated always as identity primary key,
  submission_id uuid not null references course_editorial_submissions(id) on delete restrict,
  actor_user_id uuid not null references users(id) on delete restrict,
  action text not null check (action in ('submit', 'approve_subject', 'approve_accessibility', 'request_changes', 'publish', 'withdraw', 'rollback')),
  reason text not null check (char_length(reason) between 12 and 1500),
  content_digest text not null check (content_digest ~ '^[0-9a-f]{64}$'),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index course_editorial_events_history on course_editorial_events(submission_id, occurred_at, id);

create function forbid_course_editorial_evidence_rewrite() returns trigger
language plpgsql as $$
begin
  raise exception 'Course editorial evidence is append-only';
end;
$$;
create trigger course_reviews_append_only before update or delete on course_editorial_reviews
  for each row execute function forbid_course_editorial_evidence_rewrite();
create trigger course_events_append_only before update or delete on course_editorial_events
  for each row execute function forbid_course_editorial_evidence_rewrite();

create function course_editorial_submission_immutable() returns trigger
language plpgsql as $$
begin
  if row(old.id, old.skill_id, old.path_id, old.content_digest, old.version_manifest, old.submitted_by, old.reason, old.submitted_at)
     is distinct from
     row(new.id, new.skill_id, new.path_id, new.content_digest, new.version_manifest, new.submitted_by, new.reason, new.submitted_at) then
    raise exception 'Submitted course snapshot cannot be rewritten';
  end if;
  return new;
end;
$$;
create trigger course_submission_immutable before update on course_editorial_submissions
  for each row execute function course_editorial_submission_immutable();

-- Preserve every previous editorial state transition. Restoration of an archived
-- independently approved snapshot is possible ONLY with the transaction-local
-- permission set by the publisher-only rollback service.
create or replace function enforce_editorial_state_transition() returns trigger as $$
begin
  if new.state = old.state then return new; end if;
  if current_setting('skillup.course_editorial_rollback', true) = 'approved'
     and ((old.state = 'archived' and new.state = 'published')
          or (tg_table_name = 'content_publication_records'
              and old.state = 'superseded' and new.state = 'published')) then
    return new;
  end if;
  if not (
    (old.state = 'draft' and new.state in ('in_review', 'rejected', 'archived')) or
    (old.state = 'in_review' and new.state in ('draft', 'approved', 'rejected')) or
    (old.state = 'approved' and new.state in ('draft', 'scheduled', 'published', 'rejected')) or
    (old.state = 'scheduled' and new.state in ('approved', 'published', 'archived')) or
    (old.state = 'published' and new.state in ('superseded', 'archived')) or
    (old.state = 'superseded' and new.state = 'archived') or
    (old.state = 'rejected' and new.state in ('draft', 'archived'))
  ) then
    raise exception 'Unsupported editorial transition from % to % on %',
      old.state, new.state, tg_table_name;
  end if;
  return new;
end;
$$ language plpgsql;
