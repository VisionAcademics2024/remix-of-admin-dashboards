\pset pager off
\echo '--- make-up consumed hours like any other lesson ---'
select hours_purchased, hours_used, hours_remaining from v_hours_packages
 where id='0b000000-0000-0000-0000-000000000001';

\echo '--- TEST 20: RLS — an admin sees no pay data, an owner sees it all ---'
insert into tutor_payouts (tutor_id, fortnight_start, hours_worked, rate_at_payout)
values ('c0000000-0000-0000-0000-000000000001','2026-10-26', 9, 60);

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';   -- the admin
select 'admin' as who, is_staff() as is_staff, is_owner() as is_owner,
       (select count(*) from tutor_payouts)   as payouts_visible,
       (select count(*) from tutor_pay_rates) as rates_visible,
       (select count(*) from students)        as students_visible;
select 'admin sees pay as' as note, coalesce(max(pay),0) as max_pay, coalesce(max(hourly_rate),0) as max_rate
  from v_session_pay;

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';   -- the owner
select 'owner' as who, is_staff() as is_staff, is_owner() as is_owner,
       (select count(*) from tutor_payouts)   as payouts_visible,
       (select count(*) from tutor_pay_rates) as rates_visible,
       (select count(*) from students)        as students_visible;
select 'owner sees pay as' as note, coalesce(max(pay),0) as max_pay, coalesce(max(hourly_rate),0) as max_rate
  from v_session_pay;

\echo '--- TEST 21: a signed-in user with no staff row sees nothing at all ---'
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select 'stranger' as who, is_staff() as is_staff,
       (select count(*) from students) as students_visible,
       (select count(*) from charges)  as charges_visible;

\echo '--- TEST 22: an admin cannot write pay data ---'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  insert into tutor_pay_rates (tutor_id, hourly_rate, effective_from)
  values ('c0000000-0000-0000-0000-000000000001', 999, '2027-01-01');
  raise notice 'FAIL: admin wrote a pay rate';
exception when insufficient_privilege then raise notice 'PASS: admin blocked from writing pay rates';
end $$;
reset role;
