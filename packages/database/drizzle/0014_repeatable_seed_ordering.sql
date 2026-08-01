-- The complete launch seed extends the reviewed pilot module. The pilot already
-- owns early sort positions. Resolve only seed-process collisions while keeping
-- normal application writes strict and preserving stable positions on reruns.
create or replace function skillup_seed_resolve_lesson_order()
returns trigger
language plpgsql
as $$
begin
  if current_setting('application_name', true) <> 'skillup-complete-launch-seed-v2' then
    return new;
  end if;

  if exists (
    select 1
      from lessons existing
     where existing.module_id = new.module_id
       and existing.sort_order = new.sort_order
       and existing.id <> new.id
  ) then
    if tg_op = 'UPDATE' and old.module_id = new.module_id then
      new.sort_order := old.sort_order;
    else
      select coalesce(max(existing.sort_order), 0) + 1
        into new.sort_order
        from lessons existing
       where existing.module_id = new.module_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger lessons_repeatable_launch_seed_order
before insert or update of module_id, sort_order on lessons
for each row execute function skillup_seed_resolve_lesson_order();
