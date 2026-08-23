-- =============================================================================
-- Airtable import — step 3 of 3: verification
--
-- Read-only. Run it after every load, including the final one at cutover.
--
-- With psql:  psql "$DATABASE_URL" -f 03-verify.sql   — runs the lot.
-- In the Supabase SQL editor: run one numbered section at a time. The editor
-- only shows the last result set, so running the whole file hides most of it.
-- =============================================================================

-- === 1. Row counts: live vs Airtable ===
select 'guardians'       as table_name, (select count(*) from guardians)       as loaded, (select count(*) from staging.at_guardians)  as airtable
union all select 'students',        (select count(*) from students),        (select count(*) from staging.at_students)
union all select 'tutors',          (select count(*) from tutors),          (select count(*) from staging.at_tutors)
union all select 'operating_periods',(select count(*) from operating_periods),(select count(*) from staging.at_periods)
union all select 'standard_prices', (select count(*) from standard_prices), (select count(*) from staging.at_prices)
union all select 'programs',        (select count(*) from programs),        (select count(*) from staging.at_programs)
union all select 'class_offerings', (select count(*) from class_offerings), (select count(*) from staging.at_offerings)
union all select 'enrolments',      (select count(*) from enrolments),      (select count(*) from staging.at_billing)
union all select 'hours_packages',  (select count(*) from hours_packages),  (select count(*) from staging.at_hours)
union all select 'sessions',        (select count(*) from sessions),        (select count(*) from staging.at_sessions)
union all select 'attendance',      (select count(*) from attendance),      (select count(*) from staging.at_attendance)
union all select 'charges',         (select count(*) from charges),         (select count(*) from staging.at_charges)
union all select 'tutor_payouts',   (select count(*) from tutor_payouts),   (select count(*) from staging.at_payouts);

-- 
-- === 2. Anything that did NOT come across, and why ===
select 'enrolment' as kind, staging.txt(b.fields,'Billing Code') as code,
       'Billing status: ' || coalesce(staging.txt(b.fields,'Status'),'(blank)') as reason
from staging.at_billing b
where not exists (select 1 from enrolments e where e.airtable_id = b.id)
union all
select 'session', staging.txt(s.fields,'Session Code'), 'Missing or invalid scheduled start/end'
from staging.at_sessions s
where not exists (select 1 from sessions x where x.airtable_id = s.id)
union all
select 'attendance', staging.txt(a.fields,'Attendance Code'), 'Session or Billing link did not resolve'
from staging.at_attendance a
where not exists (select 1 from attendance x where x.airtable_id = a.id)
union all
select 'charge', staging.txt(c.fields,'Charge Code'), 'Source (Hours or Attendance) did not resolve'
from staging.at_charges c
where not exists (select 1 from charges x where x.airtable_id = c.id)
order by kind, code;

-- 
-- === 3. THE ONE THAT MATTERS: hours balances vs Airtable ===
-- Every family account depends on this. difference must be 0.00 on every row.
select
  p.code,
  s.full_name                                       as student,
  p.hours_purchased,
  p.hours_used,
  p.hours_remaining                                 as remaining_here,
  round(staging.num(h.fields,'Hours Remaining'), 2) as remaining_airtable,
  -- Null rather than a false mismatch when the export did not carry the
  -- Airtable formula value; a real difference always shows as a number.
  case when staging.num(h.fields,'Hours Remaining') is null then null
       else round(p.hours_remaining - staging.num(h.fields,'Hours Remaining'), 2) end as difference
from v_hours_packages p
join students s on s.id = p.student_id
join staging.at_hours h on h.id = p.airtable_id
order by abs(coalesce(p.hours_remaining - staging.num(h.fields,'Hours Remaining'), 0)) desc, p.code;

-- 
-- === 4. Money reconciles ===
select status, count(*) as charges, sum(final_amount) as total
from v_charges group by status order by status;

-- 
-- === 5. Nothing lost its link ===
select 'attendance with no session'  as check_name, count(*) as should_be_zero
  from attendance a left join sessions s on s.id = a.session_id where s.id is null
union all
select 'attendance with no enrolment', count(*)
  from attendance a left join enrolments e on e.id = a.enrolment_id where e.id is null
union all
select 'students with no default payer', count(*)
  from students where default_payer_id is null and status = 'active'
union all
select 'hours enrolments with no eligible package', count(*)
  from enrolments e where e.method = 'hours' and e.status = 'active'
    and not exists (select 1 from package_eligibility pe where pe.enrolment_id = e.id);

-- 
-- === 6. The exception list — expect a sane length, not zero ===
select entity, issue, count(*) from v_needs_attention
group by entity, issue order by count(*) desc;

-- 
-- === 7. Tutor pay sanity ===
select t.code, t.full_name, r.hourly_rate, r.effective_from,
       (select count(*) from sessions s where s.tutor_id = t.id) as lessons
from tutors t
left join lateral (
  select hourly_rate, effective_from from tutor_pay_rates
  where tutor_id = t.id order by effective_from desc limit 1
) r on true
order by t.code;
