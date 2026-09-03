-- =============================================================================
-- What a tutor account may see and change.
--
-- The rule that matters most is the first one: is_staff() stops meaning "has a
-- staff row" and starts meaning "is an owner or an admin". Every existing
-- policy in the schema is written against it, so narrowing it here is what
-- keeps a tutor out of students, guardians, charges, invoices, packages and
-- enrolment pricing without touching a single one of those policies.
--
-- A tutor is then granted, explicitly and only:
--
--   the calendar, read-only - every class the school runs, any week, because a
--     tutor needs to know what is happening around them;
--   the roll of the lessons they themselves teach, which they may mark, since
--     the person in the room is the one who knows who turned up;
--   their own pay, in full - sessions, hours, rate and total - so they can
--     check it is right, and nobody else's.
--
-- Known and accepted: reading the roll means reading the enrolments behind it,
-- and an enrolment carries base_price. A tutor can therefore see what their own
-- students pay, though not what anybody else's do. Closing that needs a
-- purpose-built view for the roll rather than a policy, and is worth doing
-- separately rather than smuggling into an access-control change.
-- =============================================================================

-- Which tutor an account belongs to. Null for owners and admins, who are not
-- tutors; required for a tutor account, enforced below.
alter table staff add column if not exists tutor_id uuid references tutors(id) on delete restrict;
create index if not exists staff_tutor_idx on staff (tutor_id);

-- A tutor account with no tutor attached could see no lessons and no pay, and
-- would look broken rather than restricted. The test account deliberately
-- points at a real tutor for exactly this reason.
alter table staff drop constraint if exists staff_tutor_needs_link;
alter table staff add constraint staff_tutor_needs_link
  check (role <> 'tutor' or tutor_id is not null);

-- ---------------------------------------------------------------------------
-- Who is who.
-- ---------------------------------------------------------------------------

-- The narrowing. Everything already written against is_staff() now excludes
-- tutors, which is the whole safety of this change.
create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff
    where user_id = auth.uid() and is_active and role in ('owner', 'admin')
  )
$$;

create or replace function is_tutor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff where user_id = auth.uid() and is_active and role = 'tutor'
  )
$$;

-- The tutor this account teaches as. The test account points at a real tutor's
-- record, so it sees that tutor's lessons and pay.
create or replace function current_tutor_id() returns uuid
language sql stable security definer set search_path = public as $$
  select tutor_id from staff where user_id = auth.uid() and is_active
$$;

-- Does the signed-in tutor teach this lesson? The one question that decides
-- what they may mark.
create or replace function teaches_session(p_session_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from sessions s
    where s.id = p_session_id
      and s.tutor_id is not null
      and s.tutor_id = current_tutor_id()
  )
$$;

-- ---------------------------------------------------------------------------
-- The calendar, read-only.
--
-- Every class, any week, as asked. Deliberately not guardians, charges,
-- invoices, hours_packages or standard_prices: none of those are on a
-- timetable, and a tutor has no reason to read them.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'sessions', 'class_offerings', 'programs', 'operating_periods', 'tutors'
  ] loop
    execute format('drop policy if exists %I_tutor_read on %I', t, t);
    execute format(
      'create policy %I_tutor_read on %I for select to authenticated using (is_tutor())', t, t);
  end loop;
end $$;

-- Students and their enrolments, only for classes this tutor actually teaches.
-- A tutor needs the names on their own roll; they have no business reading the
-- rest of the school's students.
drop policy if exists enrolments_tutor_read on enrolments;
create policy enrolments_tutor_read on enrolments for select to authenticated
  using (
    is_tutor() and exists (
      select 1 from sessions s
      where s.class_offering_id = enrolments.class_offering_id
        and s.tutor_id = current_tutor_id()
    )
  );

drop policy if exists students_tutor_read on students;
create policy students_tutor_read on students for select to authenticated
  using (
    is_tutor() and exists (
      select 1 from enrolments e
      join sessions s on s.class_offering_id = e.class_offering_id
      where e.student_id = students.id and s.tutor_id = current_tutor_id()
    )
  );

-- ---------------------------------------------------------------------------
-- The roll: readable and markable, on their own lessons only.
--
-- Update rather than insert or delete. The roll is seeded when a lesson is
-- created; a tutor says who turned up, and never adds a student to a class or
-- removes one from it.
-- ---------------------------------------------------------------------------

drop policy if exists attendance_tutor_read on attendance;
create policy attendance_tutor_read on attendance for select to authenticated
  using (is_tutor() and teaches_session(attendance.session_id));

drop policy if exists attendance_tutor_mark on attendance;
create policy attendance_tutor_mark on attendance for update to authenticated
  using (is_tutor() and teaches_session(attendance.session_id))
  with check (is_tutor() and teaches_session(attendance.session_id));

-- ---------------------------------------------------------------------------
-- Their own pay, and nobody else's.
--
-- These three tables are owner-only, and stay so for everybody but the tutor
-- reading their own row.
-- ---------------------------------------------------------------------------

drop policy if exists tutor_payouts_own on tutor_payouts;
create policy tutor_payouts_own on tutor_payouts for select to authenticated
  using (is_tutor() and tutor_id = current_tutor_id());

drop policy if exists tutor_pay_rates_own on tutor_pay_rates;
create policy tutor_pay_rates_own on tutor_pay_rates for select to authenticated
  using (is_tutor() and tutor_id = current_tutor_id());

drop policy if exists session_pay_adjustments_own on session_pay_adjustments;
create policy session_pay_adjustments_own on session_pay_adjustments for select to authenticated
  using (is_tutor() and teaches_session(session_pay_adjustments.session_id));

-- A tutor reads their own staff row so the app knows who they are.
drop policy if exists staff_self_read on staff;
create policy staff_self_read on staff for select to authenticated
  using (user_id = auth.uid());
