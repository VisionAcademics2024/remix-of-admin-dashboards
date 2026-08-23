-- =============================================================================
-- Move the original Lovable prototype tables out of the way.
--
-- The prototype is kept, intact and with its data, but its table names
-- (students, tutors, sessions, packages) collide with the Vision CRM spec
-- schema that follows. Renaming with a proto_ prefix preserves every row,
-- index, policy and foreign key while freeing the canonical names.
--
-- Nothing here drops data.
-- =============================================================================

alter table public.students          rename to proto_students;
alter table public.tutors            rename to proto_tutors;
alter table public.sessions          rename to proto_sessions;
alter table public.packages          rename to proto_packages;
alter table public.student_packages  rename to proto_student_packages;
alter table public.session_students  rename to proto_session_students;
alter table public.user_roles        rename to proto_user_roles;

-- The helper function referenced the old name in its body.
create or replace function public.increment_sessions_used(
    _student_package_id uuid,
    _amount int default 1
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
    update public.proto_student_packages
    set sessions_used = sessions_used + _amount,
        updated_at = now(),
        status = case
            when sessions_used + _amount >= total_sessions then 'completed'
            else status
        end
    where id = _student_package_id
      and sessions_used + _amount <= total_sessions;
end;
$$;

-- Fix the prototype's attendance check constraint so the 'pending' value the
-- prototype UI offers is actually storable. Previously selecting "Pending"
-- failed at the database every time.
alter table public.proto_session_students
  drop constraint if exists session_students_attendance_status_check;
alter table public.proto_session_students
  add constraint proto_session_students_attendance_status_check
  check (attendance_status in ('pending', 'present', 'absent', 'late', 'excused'));
