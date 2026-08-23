\pset pager off
set client_min_messages = notice;

\echo '--- TEST 9: a charge cannot have two sources, or none ---'
do $$ begin
  insert into charges (student_id, payer_id, source, package_id, attendance_id, standard_amount)
  values ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','hours',
          '0b000000-0000-0000-0000-000000000001', (select id from attendance limit 1), 100);
  raise exception 'FAIL: two sources were accepted';
exception when check_violation then raise notice 'PASS: two-source charge rejected';
end $$;

\echo '--- TEST 10: the same lesson cannot be billed twice ---'
insert into charges (student_id, payer_id, source, attendance_id, standard_amount)
values ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','payg',
        (select id from attendance order by id limit 1), 120);
do $$ begin
  insert into charges (student_id, payer_id, source, attendance_id, standard_amount)
  values ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','payg',
          (select id from attendance order by id limit 1), 120);
  raise exception 'FAIL: double billing was accepted';
exception when unique_violation then raise notice 'PASS: second charge on the same lesson rejected';
end $$;

\echo '--- TEST 11: paid needs a date and a method ---'
do $$ begin
  update charges set status='paid' where source='payg';
  raise exception 'FAIL: paid without evidence accepted';
exception when check_violation then raise notice 'PASS: paid without date/method rejected';
end $$;

\echo '--- TEST 12: a package cannot be spent on an ineligible enrolment ---'
insert into enrolments (id, student_id, class_offering_id, status, starts_on, method, base_price)
values ('0a000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000002',
        '09000000-0000-0000-0000-000000000001','active','2026-09-28','hours', 800);
do $$ begin
  insert into attendance (session_id, enrolment_id, package_id)
  values ((select id from sessions order by starts_at limit 1),
          '0a000000-0000-0000-0000-000000000002','0b000000-0000-0000-0000-000000000001');
  raise exception 'FAIL: cross-student package accepted';
exception when others then raise notice 'PASS: %', SQLERRM;
end $$;

\echo '--- TEST 13: a courtesy package must be free and give a reason ---'
do $$ begin
  insert into hours_packages (student_id, package_type, hours_purchased, price)
  values ('b0000000-0000-0000-0000-000000000001','courtesy', 2, 50);
  raise exception 'FAIL: paid courtesy package accepted';
exception when check_violation then raise notice 'PASS: courtesy package with a price rejected';
end $$;

\echo '--- TEST 14: private tuition must be capacity 1 ---'
do $$ begin
  insert into class_offerings (program_id, operating_period_id, offering_type, capacity,
                               starts_on, ends_on, session_duration_hours)
  values ('f0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001',
          'private_tuition', 6, '2026-10-01','2026-10-30', 1.5);
  raise exception 'FAIL: private class with capacity 6 accepted';
exception when check_violation then raise notice 'PASS: private tuition capacity forced to 1';
end $$;

\echo '--- TEST 15: only a trial may omit the billing method ---'
do $$ begin
  insert into enrolments (student_id, class_offering_id, status, starts_on)
  values ('b0000000-0000-0000-0000-000000000002','09000000-0000-0000-0000-000000000001','active','2026-10-05');
  raise exception 'FAIL: active enrolment without a method accepted';
exception when check_violation then raise notice 'PASS: non-trial enrolment needs a billing method';
end $$;

\echo '--- TEST 16: a pay adjustment without a reason is refused ---'
do $$ begin
  insert into tutor_payouts (tutor_id, fortnight_start, hours_worked, rate_at_payout, amount_adjustment)
  values ('c0000000-0000-0000-0000-000000000001','2026-10-26', 9, 60, 25);
  raise exception 'FAIL: unexplained adjustment accepted';
exception when check_violation then raise notice 'PASS: adjustment without a written reason rejected';
end $$;

\echo '--- TEST 17: the default payer must be one of the student''s guardians ---'
insert into guardians (id, full_name) values ('a0000000-0000-0000-0000-000000000009','Unrelated Person');
do $$ begin
  update students set default_payer_id='a0000000-0000-0000-0000-000000000009'
   where id='b0000000-0000-0000-0000-000000000001';
  raise exception 'FAIL: unrelated payer accepted';
exception when others then raise notice 'PASS: %', SQLERRM;
end $$;

\echo '--- TEST 18: make-up state is derived from the linked attempt ---'
-- A second class gives the make-up somewhere to live that the student is not already on.
insert into class_offerings (id, program_id, operating_period_id, primary_tutor_id, offering_type,
                             capacity, starts_on, ends_on, recurrence, recurrence_start,
                             session_duration_hours)
values ('09000000-0000-0000-0000-000000000002','f0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001',
        'group_class', 6, '2026-11-16','2026-11-23','weekly',
        timestamptz '2026-11-16 16:00 Australia/Sydney', 1.5);
select generate_sessions('09000000-0000-0000-0000-000000000002') as catchup_lessons;

update attendance set status='absent'
 where enrolment_id='0a000000-0000-0000-0000-000000000001'
   and session_id=(select id from sessions
                   where class_offering_id='09000000-0000-0000-0000-000000000001'
                     and status<>'cancelled' order by starts_at offset 3 limit 1);
select make_up_state as should_be_outstanding from v_attendance
 where status='absent' and enrolment_id='0a000000-0000-0000-0000-000000000001';

insert into attendance (session_id, enrolment_id, att_type, source_attendance_id, package_id)
select (select id from sessions where class_offering_id='09000000-0000-0000-0000-000000000002' order by starts_at limit 1),
       a.enrolment_id, 'make_up', a.id, a.package_id
from v_attendance a where a.status='absent' and a.enrolment_id='0a000000-0000-0000-0000-000000000001';
select make_up_state as should_be_scheduled from v_attendance
 where status='absent' and enrolment_id='0a000000-0000-0000-0000-000000000001';

update attendance set status='present' where att_type='make_up';
select make_up_state as should_be_completed from v_attendance
 where status='absent' and enrolment_id='0a000000-0000-0000-0000-000000000001';
select hours_used as makeup_consumed_hours_too, hours_remaining
 from v_hours_packages where id='0b000000-0000-0000-0000-000000000001';

\echo '--- TEST 19: Needs Attention picks up the real exceptions ---'
select entity, issue, count(*) from v_needs_attention group by entity, issue order by entity, issue;
