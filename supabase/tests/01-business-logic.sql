\set ON_ERROR_STOP on
\pset pager off
set client_min_messages = warning;

-- Two auth users: an owner and an admin.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','owner@example.com'),
  ('22222222-2222-2222-2222-222222222222','admin@example.com');
insert into staff (user_id, full_name, email, role) values
  ('11111111-1111-1111-1111-111111111111','Justin','owner@example.com','owner'),
  ('22222222-2222-2222-2222-222222222222','Office','admin@example.com','admin');

-- Catalogue
insert into guardians (id, full_name) values ('a0000000-0000-0000-0000-000000000001','Parent One');
insert into students  (id, full_name) values ('b0000000-0000-0000-0000-000000000001','Sibling A'),
                                             ('b0000000-0000-0000-0000-000000000002','Sibling B');
insert into student_guardians values ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','mother'),
                                     ('b0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','mother');
update students set default_payer_id = 'a0000000-0000-0000-0000-000000000001';

insert into tutors (id, full_name, colour) values ('c0000000-0000-0000-0000-000000000001','Alice Park','#4f46e5');
insert into tutor_pay_rates (tutor_id, hourly_rate, effective_from) values
  ('c0000000-0000-0000-0000-000000000001', 60.00, '2026-01-01'),
  ('c0000000-0000-0000-0000-000000000001', 75.00, '2026-11-01');   -- later raise

insert into operating_periods (id, name, code, starts_on, ends_on, status)
  values ('d0000000-0000-0000-0000-000000000001','Term 4 2026','2026-T4','2026-09-28','2026-12-13','active');
insert into standard_prices (id, name, code, basis, quantity, unit_rate, effective_from)
  values ('e0000000-0000-0000-0000-000000000001','Y5 per hour','Y5-HR','per_hour',1,80,'2026-01-01');
insert into programs (id, name, code, standard_duration_hours)
  values ('f0000000-0000-0000-0000-000000000001','Year 5 Private','Y5-PRIV',1.5);

-- A weekly 5:30pm Wednesday class that spans the DST change (Sydney switches 2026-10-04).
insert into class_offerings (id, program_id, operating_period_id, primary_tutor_id, offering_type,
                             capacity, starts_on, ends_on, recurrence, recurrence_start,
                             session_duration_hours)
values ('09000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001',
        'private_tuition', 1, '2026-09-28','2026-11-11','weekly',
        timestamptz '2026-09-30 17:30 Australia/Sydney', 1.5);

\echo '--- TEST 1: generation keeps 5:30pm Sydney across the DST change ---'
select generate_sessions('09000000-0000-0000-0000-000000000001') as lessons_created;
select session_date,
       to_char(starts_at at time zone 'Australia/Sydney','HH24:MI') as syd_start,
       to_char(ends_at   at time zone 'Australia/Sydney','HH24:MI') as syd_end,
       duration_hours
from v_sessions where class_offering_id='09000000-0000-0000-0000-000000000001' order by starts_at;

\echo '--- TEST 2: re-running generation creates nothing (idempotent) ---'
select generate_sessions('09000000-0000-0000-0000-000000000001') as second_run_should_be_zero;

\echo '--- TEST 3: enrol, seed roll, and check the roll is complete ---'
insert into enrolments (id, student_id, class_offering_id, status, starts_on, method,
                        standard_price_id, base_price, hours_override)
values ('0a000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001',
        '09000000-0000-0000-0000-000000000001','active','2026-09-28','hours',
        'e0000000-0000-0000-0000-000000000001', 800, 10);
insert into hours_packages (id, student_id, hours_purchased, price, approved_on)
values ('0b000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001',10,800,'2026-09-28');
insert into package_eligibility values ('0b000000-0000-0000-0000-000000000001','0a000000-0000-0000-0000-000000000001');
update enrolments set default_package_id='0b000000-0000-0000-0000-000000000001'
  where id='0a000000-0000-0000-0000-000000000001';

select seed_roll_for_offering('09000000-0000-0000-0000-000000000001') as roll_entries_created;
select seed_roll_for_offering('09000000-0000-0000-0000-000000000001') as reseed_should_be_zero;

\echo '--- TEST 4: marking present consumes hours; un-marking refunds ---'
update attendance set status='present'
  where enrolment_id='0a000000-0000-0000-0000-000000000001'
    and session_id in (select id from sessions where class_offering_id='09000000-0000-0000-0000-000000000001' order by starts_at limit 3);
select hours_purchased, hours_used, hours_remaining, is_low from v_hours_packages where id='0b000000-0000-0000-0000-000000000001';

update attendance set status='not_marked'
  where enrolment_id='0a000000-0000-0000-0000-000000000001'
    and session_id = (select id from sessions where class_offering_id='09000000-0000-0000-0000-000000000001' order by starts_at limit 1);
select hours_used as after_unmarking, hours_remaining from v_hours_packages where id='0b000000-0000-0000-0000-000000000001';

\echo '--- TEST 5: cancelling a lesson refunds everyone on it ---'
update sessions set status='cancelled'
  where id = (select id from sessions where class_offering_id='09000000-0000-0000-0000-000000000001' order by starts_at offset 1 limit 1);
select hours_used as after_cancelling, hours_remaining from v_hours_packages where id='0b000000-0000-0000-0000-000000000001';

\echo '--- TEST 6: pay uses the rate in force on the lesson date, not the latest ---'
select session_date, payable_hours, hourly_rate, pay
from v_session_pay
where class_offering_id='09000000-0000-0000-0000-000000000001'
  and session_date in ('2026-10-28','2026-11-04')
order by session_date;

\echo '--- TEST 7: cancelled lessons pay nobody ---'
select session_date, payable_hours, pay from v_session_pay
where session_id = (select id from sessions where status='cancelled' limit 1);

\echo '--- TEST 8: fortnight boundaries are absolute, including before the anchor ---'
select d, fortnight_start(d) from (values (date '2026-08-03'),(date '2026-08-16'),(date '2026-08-17'),(date '2026-07-30')) t(d);
