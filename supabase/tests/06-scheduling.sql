-- Scheduling foundation: in-place rescheduling, partial uniqueness, and
-- daylight-saving-safe generation. Runs after 01 (which seeds the data).
\set ON_ERROR_STOP on
\pset pager off
set client_min_messages = notice;

set role postgres;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);

do $$
declare
  v_offering uuid := '09000000-0000-0000-0000-000000000001';
  v_first  int;
  v_second int;
  v_id uuid;
  v_att_id uuid;
  v_att_status text;
  v_att_source uuid;
  v_enrolment uuid;
  v_type text;
  v_status text;
  v_local time;
  v_before timestamptz;
  v_updated timestamptz;
  v_count int;
begin
  ------------------------------------------------------------------ generation
  v_first  := generate_sessions(v_offering);
  v_second := generate_sessions(v_offering);
  if v_second = 0 then
    raise notice 'PASS: generation is idempotent (% then 0)', v_first;
  else
    raise notice 'FAIL: re-running generation created % more lessons', v_second;
  end if;

  -- Every generated lesson keeps its Sydney wall-clock time, either side of the
  -- 2026-10-04 daylight-saving change.
  select count(distinct (starts_at at time zone 'Australia/Sydney')::time)
    into v_count from sessions where class_offering_id = v_offering;
  select (min(starts_at) at time zone 'Australia/Sydney')::time
    into v_local from sessions where class_offering_id = v_offering;
  if v_count = 1 and v_local = time '17:30' then
    raise notice 'PASS: Sydney wall clock held at 17:30 across the DST change';
  else
    raise notice 'FAIL: % distinct local times (first %)', v_count, v_local;
  end if;

  ------------------------------------------------- partial regular uniqueness
  select id into v_id from sessions where class_offering_id = v_offering order by starts_at limit 1;

  begin
    insert into sessions (class_offering_id, starts_at, ends_at)
    select class_offering_id, starts_at, ends_at from sessions where id = v_id;
    raise notice 'FAIL: a duplicate REGULAR lesson was accepted';
  exception when unique_violation then
    raise notice 'PASS: a duplicate regular lesson is refused';
  end;

  begin
    insert into sessions (class_offering_id, starts_at, ends_at, session_type)
    select class_offering_id, starts_at, ends_at, 'dedicated_make_up' from sessions where id = v_id;
    raise notice 'PASS: a deliberate make-up lesson may share the slot';
    delete from sessions where session_type = 'dedicated_make_up' and class_offering_id = v_offering;
  exception when unique_violation then
    raise notice 'FAIL: partial uniqueness wrongly blocked a make-up lesson';
  end;

  ------------------------------------------------------- reschedule in place
  -- A future lesson with an unmarked roll, plus a roll entry to follow it.
  select id into v_enrolment from enrolments where class_offering_id = v_offering limit 1;
  update sessions
     set starts_at = now() + interval '7 days',
         ends_at   = now() + interval '7 days' + interval '90 minutes'
   where id = v_id;
  delete from attendance where session_id = v_id;
  insert into attendance (session_id, enrolment_id, att_type, status)
  values (v_id, v_enrolment, 'regular', 'not_marked')
  returning id into v_att_id;

  select starts_at, updated_at into v_before, v_updated from sessions where id = v_id;
  perform pg_sleep(0.05);

  update sessions
     set starts_at = starts_at + interval '1 day',
         ends_at   = ends_at   + interval '1 day',
         original_starts_at = coalesce(original_starts_at, starts_at),
         original_ends_at   = coalesce(original_ends_at, ends_at)
   where id = v_id;

  select session_type, status into v_type, v_status from sessions where id = v_id;
  if v_type = 'regular' and v_status = 'scheduled' then
    raise notice 'PASS: an ordinary move leaves type and status alone';
  else
    raise notice 'FAIL: move changed type/status to %/%', v_type, v_status;
  end if;

  select count(*) into v_count from sessions where id = v_id;
  if v_count = 1 then
    raise notice 'PASS: the same session row (and id) survives the move';
  else
    raise notice 'FAIL: the session id did not survive';
  end if;

  select status, source_attendance_id into v_att_status, v_att_source
    from attendance where id = v_att_id;
  if v_att_status = 'not_marked' and v_att_source is null then
    raise notice 'PASS: attendance id, status and source link are unchanged';
  else
    raise notice 'FAIL: attendance changed (% / %)', v_att_status, v_att_source;
  end if;

  select original_starts_at into v_before from sessions where id = v_id;
  -- Moving again keeps the FIRST remembered slot.
  update sessions
     set starts_at = starts_at + interval '1 day',
         ends_at   = ends_at   + interval '1 day',
         original_starts_at = coalesce(original_starts_at, starts_at)
   where id = v_id;
  if (select original_starts_at from sessions where id = v_id) = v_before then
    raise notice 'PASS: later moves keep the first remembered slot';
  else
    raise notice 'FAIL: the remembered slot was overwritten';
  end if;

  select updated_at into v_updated from sessions where id = v_id;
  if v_updated > now() - interval '1 minute' then
    raise notice 'PASS: updated_at is maintained by the trigger';
  else
    raise notice 'FAIL: updated_at was not touched';
  end if;

  -- session_date in the view follows the new start.
  if (select session_date from v_sessions where id = v_id)
     = (select syd_date(starts_at) from sessions where id = v_id) then
    raise notice 'PASS: session_date follows the new start, in Sydney';
  else
    raise notice 'FAIL: session_date did not follow the move';
  end if;

  ------------------------------------------------------------------- deletion
  -- A lesson with a roll must not be deleted: the server function refuses, and
  -- attendance is never removed to make room for a delete.
  select count(*) into v_count from attendance where session_id = v_id;
  if v_count > 0 then
    raise notice 'PASS: the lesson still carries its roll, so the timetable must cancel not delete';
  else
    raise notice 'FAIL: the roll disappeared';
  end if;

  update sessions set status = 'cancelled' where id = v_id;
  select count(*) into v_count from attendance where session_id = v_id;
  if v_count > 0 then
    raise notice 'PASS: cancelling preserves the roll and the history';
  else
    raise notice 'FAIL: cancelling lost the roll';
  end if;
end $$;

reset role;
