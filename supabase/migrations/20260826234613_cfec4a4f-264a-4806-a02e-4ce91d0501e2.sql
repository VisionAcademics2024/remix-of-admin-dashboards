-- Scheduling foundation: reconcile the reviewed scheduling schema drift.
--
-- Forward-only. Nothing here rewrites business history: no existing lesson's
-- time, status, type, tutor, room, roll, enrolment, hours, charge, payout or
-- invoice is touched. The only existing-row write is the technical
-- `updated_at` timestamp added below.

-- 1. Remember the slot a lesson was generated in, so the first in-place
--    reschedule can record where it came from. Deliberately left null on every
--    existing row: the true original slot of lessons already moved is unknown
--    and inventing it would be inventing history.
alter table public.sessions
  add column if not exists original_starts_at timestamptz,
  add column if not exists original_ends_at   timestamptz;

comment on column public.sessions.original_starts_at is
  'The start this lesson held before it was first rescheduled. Null while it has never been moved. Never overwritten by later moves.';
comment on column public.sessions.original_ends_at is
  'Companion to original_starts_at: the end this lesson held before its first reschedule.';

-- 2. A technical last-touched timestamp, using the project existing trigger.
alter table public.sessions
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists sessions_touch on public.sessions;
create trigger sessions_touch
  before update on public.sessions
  for each row execute function public.set_updated_at();

-- 3. Uniqueness applies to REGULAR lessons only. Regenerating a term still
--    cannot create duplicates, while deliberately created make-up lessons may
--    sit alongside (or on top of) an ordinary lesson.
drop index if exists public.sessions_no_duplicates;
drop index if exists public.sessions_unique_slot;

create unique index if not exists sessions_regular_slot
  on public.sessions (class_offering_id, starts_at)
  where session_type = 'regular';

-- 4. Generation walks the Sydney wall clock, so a 5:30pm class stays 5:30pm
--    across the October daylight-saving change. one_off and ad_hoc generate
--    nothing. Idempotent through the partial index above.
create or replace function public.generate_sessions(p_offering_id uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare
  o           class_offerings%rowtype;
  v_step      int;
  v_local     timestamp;      -- naive Sydney wall clock
  v_time      time;
  v_date      date;
  v_starts_at timestamptz;
  v_inserted  int := 0;
  v_row_count int;
begin
  if not public.is_staff() then
    raise exception 'Not allowed.';
  end if;

  select * into o from class_offerings where id = p_offering_id;
  if not found then
    raise exception 'That class no longer exists.';
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
    raise exception 'Set the first lesson date and time on the class before generating lessons.';
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

-- 5. Preserve the existing staff-only posture and grants (unchanged, restated
--    so this migration is self-contained).
alter table public.sessions enable row level security;
grant select, insert, update, delete on public.sessions to authenticated;
grant all on public.sessions to service_role;
revoke execute on function public.generate_sessions(uuid) from public;
grant execute on function public.generate_sessions(uuid) to authenticated, service_role;
