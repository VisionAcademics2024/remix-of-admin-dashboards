\pset pager off
set client_min_messages = notice;
insert into proto_students (first_name, last_name) values ('Legacy','Row');

\echo '--- TEST 23: the prototype tables are behind the same staff check ---'
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';   -- no staff row
select 'stranger' as who, (select count(*) from proto_students) as proto_students_visible;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';   -- admin
select 'admin' as who, (select count(*) from proto_students) as proto_students_visible;
reset role;

\echo '--- TEST 24: bootstrap_first_owner is inert once staff exist ---'
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$ begin
  perform bootstrap_first_owner('Sneaky');
  raise notice 'FAIL: a stranger escalated to owner';
exception when others then raise notice 'PASS: %', SQLERRM;
end $$;
reset role;

\echo '--- TEST 25: the prototype "Pending" attendance value now saves ---'
insert into proto_sessions (title, start_time, end_time)
  values ('Legacy lesson', now(), now() + interval '1 hour');
insert into proto_session_students (session_id, student_id, attendance_status)
  select (select id from proto_sessions limit 1), (select id from proto_students limit 1), 'pending';
select attendance_status from proto_session_students;
