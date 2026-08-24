-- Let classes stack: more than one lesson in the same time frame.
--
-- The old rule was one lesson per class per start time. That is what blocked a
-- moved make-up with "there is already a lesson for this class at that time" —
-- and it stopped a class holding a make-up on top of its normal lesson.
--
-- The rule now applies only to REGULAR generated lessons, so re-generating a
-- term still can't create duplicates. Make-ups (dedicated_make_up) may sit
-- anywhere — on top of a regular lesson, or beside each other — so a lesson can
-- be moved onto any date, and different groups can share a slot.

-- Replace the total unique slot index (under either of the names it has had)
-- with a partial one that only covers regular lessons.
drop index if exists public.sessions_no_duplicates;
drop index if exists public.sessions_unique_slot;

create unique index if not exists sessions_regular_slot
  on public.sessions (class_offering_id, starts_at)
  where session_type = 'regular';

-- generate_sessions targets that partial index, so its ON CONFLICT carries the
-- same predicate. The body is otherwise identical to the original.
create or replace function generate_sessions(p_offering_id uuid)
returns int
language plpgsql security invoker set search_path = public as $$
declare
  o           class_offerings%rowtype;
  v_step      int;
  v_local     timestamp;      -- naive Sydney wall-clock
  v_time      time;
  v_date      date;
  v_starts_at timestamptz;
  v_inserted  int := 0;
  v_row_count int;
begin
  select * into o from class_offerings where id = p_offering_id;
  if not found then
    raise exception 'Class offering % not found', p_offering_id;
  end if;

  v_step := case o.recurrence
              when 'weekly'      then 7
              when 'fortnightly' then 14
              when 'daily'       then 1
              else null
            end;

  -- one_off and ad_hoc generate nothing; those lessons are added by hand.
  if v_step is null then
    return 0;
  end if;

  if o.recurrence_start is null then
    raise exception 'Class offering % has no recurrence_start, so lessons cannot be generated', o.code;
  end if;

  v_local := o.recurrence_start at time zone 'Australia/Sydney';
  v_time  := v_local::time;
  v_date  := v_local::date;

  while v_date <= o.ends_on loop
    if v_date >= o.starts_on then
      -- Rebuild the instant from the Sydney wall clock on THIS date.
      v_starts_at := (v_date + v_time) at time zone 'Australia/Sydney';

      insert into sessions (class_offering_id, tutor_id, starts_at, ends_at, room)
      values (
        o.id,
        o.primary_tutor_id,
        v_starts_at,
        v_starts_at + make_interval(mins => round(o.session_duration_hours * 60)::int),
        o.room
      )
      on conflict (class_offering_id, starts_at) where session_type = 'regular' do nothing;

      get diagnostics v_row_count = row_count;
      v_inserted := v_inserted + v_row_count;
    end if;

    v_date := v_date + v_step;
  end loop;

  return v_inserted;
end $$;
