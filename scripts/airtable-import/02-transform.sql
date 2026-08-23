-- =============================================================================
-- Airtable import — step 2 of 3: transform
--
-- Staging → live, in dependency order. Every insert carries airtable_id and
-- ends with "on conflict (airtable_id) do nothing", so the whole file is
-- re-runnable: run it, fix something in Airtable, re-extract, run it again.
--
-- Codes are NOT carried across. Every `code` column in the schema is generated
-- from a sequence, so rows are inserted in a deterministic order and the codes
-- come out of the database. Where the Airtable code already matched the shape
-- (STU, GUA, TUT, HRS, SES, ATT, CHG) it comes out identical. Class Offerings
-- and Billing are renumbered — that was agreed, and the originals live on in
-- airtable_id forever.
--
-- Runs as one transaction. Either all of it lands or none of it does.
-- =============================================================================

begin;

set constraints all deferred;   -- students.default_payer_id is checked at commit

-- ---------------------------------------------------------------- 1. guardians
insert into guardians (full_name, email, mobile, status, notes, airtable_id)
select
  staging.txt(fields, 'Full Name'),
  staging.txt(fields, 'Email'),
  staging.txt(fields, 'Mobile'),
  coalesce(lower(staging.txt(fields, 'Status')), 'active')::person_status,
  staging.txt(fields, 'Notes'),
  id
from staging.at_guardians
order by staging.txt(fields, 'Guardian Code'), created_time
on conflict (airtable_id) do nothing;

-- ----------------------------------------------------------------- 2. students
-- default_payer_id is deliberately left until the guardian links exist.
insert into students (
  full_name, status, year_level, current_school, date_of_birth, joined_on,
  how_they_found_us, notes, airtable_id
)
select
  staging.txt(fields, 'Student Name'),
  coalesce(lower(staging.txt(fields, 'Status')), 'active')::person_status,
  staging.txt(fields, 'Year Level'),
  staging.txt(fields, 'Current School'),
  staging.dt(fields, 'Date of Birth'),
  staging.dt(fields, 'Joined Date'),
  staging.txt(fields, 'How They Found Us'),
  staging.txt(fields, 'Notes'),
  id
from staging.at_students
order by staging.txt(fields, 'Student Code'), created_time
on conflict (airtable_id) do nothing;

-- -------------------------------------------------------- 3. student_guardians
-- The Parents / Guardians link is many-to-many, so every element is taken.
insert into student_guardians (student_id, guardian_id)
select distinct st.id, g.id
from staging.at_students s
cross join lateral jsonb_array_elements_text(coalesce(s.fields -> 'Parents / Guardians', '[]'::jsonb)) as link(rec)
join students  st on st.airtable_id = s.id
join guardians g  on g.airtable_id  = link.rec
on conflict do nothing;

-- The default payer must also be a guardian, so add that link too if the
-- Parents / Guardians field somehow missed it.
insert into student_guardians (student_id, guardian_id)
select distinct st.id, g.id
from staging.at_students s
join students  st on st.airtable_id = s.id
join guardians g  on g.airtable_id  = staging.link1(s.fields, 'Default Payer / Contact')
on conflict do nothing;

update students st
set default_payer_id = g.id
from staging.at_students s
join guardians g on g.airtable_id = staging.link1(s.fields, 'Default Payer / Contact')
where st.airtable_id = s.id;

-- ------------------------------------------------------------------- 4. tutors
insert into tutors (full_name, email, mobile, status, notes, airtable_id)
select
  staging.txt(fields, 'Tutor Name'),
  staging.txt(fields, 'Email'),
  staging.txt(fields, 'Mobile'),
  coalesce(lower(staging.txt(fields, 'Status')), 'active')::person_status,
  staging.txt(fields, 'Notes'),
  id
from staging.at_tutors
order by staging.txt(fields, 'Tutor Code'), created_time
on conflict (airtable_id) do nothing;

-- Airtable holds one current rate per tutor. It becomes the first row of rate
-- history, effective from before the earliest lesson so migrated lessons price
-- correctly rather than computing at zero.
insert into tutor_pay_rates (tutor_id, hourly_rate, effective_from, note)
select
  t.id,
  staging.num(s.fields, 'Hourly Rate'),
  coalesce(
    (select min((staging.ts(x.fields, 'Scheduled Start') at time zone 'Australia/Sydney')::date)
     from staging.at_sessions x),
    date '2020-01-01'
  ),
  'Imported from Airtable as the tutor''s current rate.'
from staging.at_tutors s
join tutors t on t.airtable_id = s.id
where staging.num(s.fields, 'Hourly Rate') is not null
on conflict (tutor_id, effective_from) do nothing;

-- -------------------------------------------------------- 5. operating_periods
insert into operating_periods (name, code, period_type, starts_on, ends_on, status, airtable_id)
select
  staging.txt(fields, 'Period Name'),
  staging.txt(fields, 'Period Code'),
  case staging.txt(fields, 'Period Type')
    when 'Standard Term'        then 'standard_term'
    when 'Holiday Intensive'    then 'holiday_intensive'
    else 'other'
  end::period_type,
  staging.dt(fields, 'Start Date'),
  staging.dt(fields, 'End Date'),
  coalesce(lower(staging.txt(fields, 'Status')), 'planned')::period_status,
  id
from staging.at_periods
order by staging.txt(fields, 'Period Code'), created_time
on conflict (airtable_id) do nothing;

-- ----------------------------------------------------------- 6. standard_prices
insert into standard_prices (
  name, code, year_group, scope, basis, quantity, unit_rate,
  effective_from, effective_to, status, notes, airtable_id
)
select
  staging.txt(fields, 'Standard Price Name'),
  staging.txt(fields, 'Standard Price Code'),
  staging.txt(fields, 'Year Group'),
  staging.txt(fields, 'Service / Pricing Scope'),
  case staging.txt(fields, 'Pricing Basis')
    when 'Per Hour'           then 'per_hour'
    when 'Per Session'        then 'per_session'
    when 'Fixed Hours Price'  then 'fixed_hours_price'
  end::pricing_basis,
  -- quantity must be > 0; a blank catalogue quantity defaults to one unit.
  coalesce(nullif(staging.num(fields, 'Standard Hours / Sessions'), 0), 1),
  coalesce(staging.num(fields, 'Standard Price / Unit Rate'), 0),
  coalesce(staging.dt(fields, 'Effective From'), date '2020-01-01'),
  staging.dt(fields, 'Effective To'),
  coalesce(lower(staging.txt(fields, 'Status')), 'active')::price_status,
  staging.txt(fields, 'Notes'),
  id
from staging.at_prices
order by staging.txt(fields, 'Standard Price Code'), created_time
on conflict (airtable_id) do nothing;

-- ----------------------------------------------------------------- 7. programs
insert into programs (
  name, code, year_level, subject, exam_focus, default_offering_type,
  standard_duration_hours, default_price_id, is_active, notes, airtable_id
)
select
  staging.txt(p.fields, 'Program Name'),
  staging.txt(p.fields, 'Program Code'),
  staging.txt(p.fields, 'Year Level'),
  staging.txt(p.fields, 'Subject'),
  staging.txt(p.fields, 'Exam Focus'),
  case staging.txt(p.fields, 'Default Offering Type')
    when 'Group Class'      then 'group_class'
    when 'Private Tuition'  then 'private_tuition'
  end::offering_type,
  coalesce(nullif(staging.num(p.fields, 'Standard Duration'), 0), 1),
  sp.id,
  coalesce((p.fields ->> 'Active')::boolean, true),
  staging.txt(p.fields, 'Notes'),
  p.id
from staging.at_programs p
left join standard_prices sp on sp.airtable_id = staging.link1(p.fields, 'Default Standard Price')
order by staging.txt(p.fields, 'Program Code'), p.created_time
on conflict (airtable_id) do nothing;

-- ---------------------------------------------------------- 8. class_offerings
-- Renumbered OFF-0001.. in Airtable creation order, because the existing codes
-- are a mix of the old OFF-2026T3-… format and newer OFF-00nn ones.
insert into class_offerings (
  program_id, operating_period_id, primary_tutor_id, offering_type, capacity,
  starts_on, ends_on, recurrence, recurrence_start, session_duration_hours,
  room, price_override, status, notes, airtable_id
)
select
  pr.id, op.id, tu.id,
  case staging.txt(o.fields, 'Offering Type')
    when 'Group Class'      then 'group_class'
    when 'Private Tuition'  then 'private_tuition'
  end::offering_type,
  -- private tuition is capacity 1 whatever Airtable says
  case when staging.txt(o.fields, 'Offering Type') = 'Private Tuition' then 1
       else greatest(coalesce(staging.num(o.fields, 'Capacity'), 1)::int, 1) end,
  staging.dt(o.fields, 'Start Date'),
  staging.dt(o.fields, 'End Date'),
  case staging.txt(o.fields, 'Recurrence Pattern')
    when 'Weekly'       then 'weekly'
    when 'Fortnightly'  then 'fortnightly'
    when 'Daily'        then 'daily'
    when 'One-off'      then 'one_off'
    when 'Ad hoc'       then 'ad_hoc'
    else 'weekly'
  end::recurrence_pattern,
  staging.ts(o.fields, 'Recurrence Start'),
  coalesce(nullif(staging.num(o.fields, 'Standard Session Duration'), 0), 1),
  staging.txt(o.fields, 'Room'),
  staging.num(o.fields, 'Offering Price Override'),
  coalesce(lower(staging.txt(o.fields, 'Status')), 'planned')::offering_status,
  staging.txt(o.fields, 'Notes'),
  o.id
from staging.at_offerings o
join      programs          pr on pr.airtable_id = staging.link1(o.fields, 'Program')
join      operating_periods op on op.airtable_id = staging.link1(o.fields, 'Operating Period')
left join tutors            tu on tu.airtable_id = staging.link1(o.fields, 'Primary Tutor')
order by o.created_time
on conflict (airtable_id) do nothing;

-- --------------------------------------------------------------- 9. enrolments
-- Airtable "Billing" is an enrolment. Renumbered BILL-nnnn → ENR-nnnn in
-- Billing Code order, so the sequence follows the original numbering.
insert into enrolments (
  student_id, class_offering_id, status, starts_on, ends_on, closure, method,
  standard_price_id, base_price, adjustment, adjustment_value, hours_override,
  airtable_id
)
select
  st.id, co.id,
  lower(staging.txt(b.fields, 'Status'))::enrolment_status,
  staging.dt(b.fields, 'Start Date'),
  staging.dt(b.fields, 'End Date'),
  nullif(lower(staging.txt(b.fields, 'Closure Reason')), '')::closure_reason,
  case staging.txt(b.fields, 'Billing Method')
    when 'Hours' then 'hours'
    when 'PAYG'  then 'payg'
  end::billing_method,
  sp.id,
  staging.num(b.fields, 'Base Price'),
  case staging.txt(b.fields, 'Adjustment Type')
    when 'Percentage'           then 'percentage'
    when 'Fixed Amount'         then 'fixed_amount'
    when 'Final Price Override' then 'final_price_override'
    else 'none'
  end::adjustment_type,
  coalesce(staging.num(b.fields, 'Adjustment Value'), 0),
  staging.num(b.fields, 'Hours Purchased Override'),
  b.id
from staging.at_billing b
join      students        st on st.airtable_id = staging.link1(b.fields, 'Student')
join      class_offerings co on co.airtable_id = staging.link1(b.fields, 'Class Offering')
left join standard_prices sp on sp.airtable_id = staging.link1(b.fields, 'Standard Price')
-- Drafts are excluded: they are half-filled records with no equivalent status.
where staging.txt(b.fields, 'Status') in ('Trial', 'Active', 'Closed')
order by staging.txt(b.fields, 'Billing Code'), b.created_time
on conflict (airtable_id) do nothing;

-- ----------------------------------------------------------- 10. hours_packages
insert into hours_packages (
  student_id, package_type, hours_purchased, price, standard_price_id,
  approved_on, status, low_balance_threshold, courtesy_reason, admin_note,
  airtable_id
)
select
  st.id,
  coalesce(lower(staging.txt(h.fields, 'Hours Type')), 'purchased')::package_type,
  staging.num(h.fields, 'Hours Purchased'),
  -- a courtesy package must be free; the check constraint enforces it
  case when lower(staging.txt(h.fields, 'Hours Type')) = 'courtesy' then 0
       else coalesce(staging.num(h.fields, 'Final Hours Price'), 0) end,
  sp.id,
  coalesce(staging.dt(h.fields, 'Approval Date'), current_date),
  coalesce(lower(staging.txt(h.fields, 'Status')), 'active')::package_status,
  coalesce(staging.num(h.fields, 'Low Balance Threshold'), 2),
  case when lower(staging.txt(h.fields, 'Hours Type')) = 'courtesy'
       then coalesce(staging.txt(h.fields, 'Courtesy Reason'), 'Imported from Airtable')
       else staging.txt(h.fields, 'Courtesy Reason') end,
  staging.txt(h.fields, 'Admin Note'),
  h.id
from staging.at_hours h
join      students        st on st.airtable_id = staging.link1(h.fields, 'Student')
left join standard_prices sp on sp.airtable_id = staging.link1(h.fields, 'Standard Price Source')
order by staging.txt(h.fields, 'Hours Code'), h.created_time
on conflict (airtable_id) do nothing;

-- ------------------------------------------------------ 11. package_eligibility
-- The most misunderstood relationship in the system, and the one the roll
-- depends on. Every element of Hours."Eligible Billing" becomes a row.
insert into package_eligibility (package_id, enrolment_id)
select distinct hp.id, e.id
from staging.at_hours h
cross join lateral jsonb_array_elements_text(coalesce(h.fields -> 'Eligible Billing', '[]'::jsonb)) as link(rec)
join hours_packages hp on hp.airtable_id = h.id
join enrolments     e  on e.airtable_id  = link.rec
on conflict do nothing;

update enrolments e
set default_package_id = hp.id
from staging.at_billing b
join hours_packages hp on hp.airtable_id = staging.link1(b.fields, 'Default Hours')
where e.airtable_id = b.id;

-- ---------------------------------------------------------------- 12. sessions
insert into sessions (
  class_offering_id, tutor_id, session_type, status, starts_at, ends_at,
  room, notes, airtable_id
)
select
  co.id, tu.id,
  case staging.txt(s.fields, 'Session Type')
    when 'Dedicated Make-up' then 'dedicated_make_up'
    else 'regular'
  end::session_type,
  case staging.txt(s.fields, 'Status')
    when 'Scheduled'             then 'scheduled'
    when 'Completed'             then 'completed'
    when 'Cancelled - No Class'  then 'cancelled'
    when 'Rescheduled'           then 'rescheduled'
    else 'scheduled'
  end::session_status,
  staging.ts(s.fields, 'Scheduled Start'),
  staging.ts(s.fields, 'Scheduled End'),
  staging.txt(s.fields, 'Room'),
  staging.txt(s.fields, 'Operational Notes'),
  s.id
from staging.at_sessions s
join      class_offerings co on co.airtable_id = staging.link1(s.fields, 'Class Offering')
left join tutors          tu on tu.airtable_id = staging.link1(s.fields, 'Tutor')
where staging.ts(s.fields, 'Scheduled Start') is not null
  and staging.ts(s.fields, 'Scheduled End')   is not null
  and staging.ts(s.fields, 'Scheduled End')   > staging.ts(s.fields, 'Scheduled Start')
order by staging.ts(s.fields, 'Scheduled Start'), s.created_time
on conflict (airtable_id) do nothing;

-- Second pass: a rescheduled lesson points at the one it replaces.
update sessions tgt
set replaces_session_id = src.id
from staging.at_sessions s
join sessions src on src.airtable_id = staging.link1(s.fields, 'Replacement For')
where tgt.airtable_id = s.id;

-- Per-lesson pay adjustments. Owner-only, and the note is mandatory.
insert into session_pay_adjustments (session_id, amount, note)
select
  se.id,
  staging.num(s.fields, 'Pay Adjustment'),
  coalesce(staging.txt(s.fields, 'Pay Note'), 'Imported from Airtable without a stated reason.')
from staging.at_sessions s
join sessions se on se.airtable_id = s.id
where coalesce(staging.num(s.fields, 'Pay Adjustment'), 0) <> 0
  -- No natural key on this table, so re-running would otherwise duplicate.
  and not exists (select 1 from session_pay_adjustments spa where spa.session_id = se.id);

-- -------------------------------------------------------------- 13. attendance
insert into attendance (
  session_id, enrolment_id, att_type, status, package_id, correction_note,
  airtable_id
)
select
  se.id, e.id,
  -- Make-ups land as 'regular' and are promoted in the second pass below.
  -- make_up_has_source is an immediate check, so the type and the source have
  -- to be set in the same statement — they cannot be filled in afterwards.
  case staging.txt(a.fields, 'Attendance Type')
    when 'Trial' then 'trial'
    else 'regular'
  end::attendance_type,
  case staging.txt(a.fields, 'Attendance Status')
    when 'Present'  then 'present'
    when 'Absent'   then 'absent'
    else 'not_marked'
  end::attendance_status,
  -- Only attach the package when eligibility actually exists, or the trigger
  -- rejects the row. A missing link surfaces on Needs Attention instead.
  (select hp.id from hours_packages hp
    where hp.airtable_id = staging.link1(a.fields, 'Hours')
      and exists (select 1 from package_eligibility pe
                  where pe.package_id = hp.id and pe.enrolment_id = e.id)),
  staging.txt(a.fields, 'Admin Correction Note'),
  a.id
from staging.at_attendance a
join sessions   se on se.airtable_id = staging.link1(a.fields, 'Session')
join enrolments e  on e.airtable_id  = staging.link1(a.fields, 'Billing')
order by staging.txt(a.fields, 'Attendance Code'), a.created_time
on conflict (airtable_id) do nothing;

-- Second pass: promote the make-ups, setting type and source together so the
-- check constraint is satisfied by the same statement.
update attendance tgt
set att_type = 'make_up',
    source_attendance_id = src.id
from staging.at_attendance a
join attendance src on src.airtable_id = staging.link1(a.fields, 'Source Absence')
where tgt.airtable_id = a.id
  and staging.txt(a.fields, 'Attendance Type') = 'Make-up';

-- A make-up whose source absence did not come across stays 'regular' rather
-- than being lost, with a note saying what happened.
update attendance tgt
set correction_note = concat_ws(' ', tgt.correction_note,
      '[Import] Recorded as a make-up in Airtable, but its source absence did not come across.')
from staging.at_attendance a
where tgt.airtable_id = a.id
  and staging.txt(a.fields, 'Attendance Type') = 'Make-up'
  and tgt.att_type <> 'make_up';

-- ----------------------------------------------------------------- 14. charges
insert into charges (
  student_id, payer_id, source, package_id, attendance_id, standard_amount,
  adjustment, route, status, invoice_date, xero_invoice_no, paid_date, method,
  payment_ref, notes, airtable_id
)
select
  st.id,
  pa.id,
  case staging.txt(c.fields, 'Source Type')
    when 'Hours' then 'hours'
    else 'payg'
  end::charge_source,
  case when staging.txt(c.fields, 'Source Type') = 'Hours' then hp.id end,
  case when staging.txt(c.fields, 'Source Type') <> 'Hours' then at.id end,
  coalesce(staging.num(c.fields, 'Standard Amount'), 0),
  coalesce(staging.num(c.fields, 'Price Adjustment'), 0),
  case staging.txt(c.fields, 'Charge Route')
    when 'Internal Cash/Bank' then 'internal'
    else 'parent'
  end::charge_route,
  case staging.txt(c.fields, 'Charge Status')
    when 'To Invoice' then 'to_invoice'
    when 'Invoiced'   then 'invoiced'
    when 'Paid'       then 'paid'
    when 'Cancelled'  then 'cancelled'
    else 'to_invoice'
  end::charge_status,
  staging.dt(c.fields, 'Invoice Date'),
  staging.txt(c.fields, 'Xero Invoice Number'),
  staging.dt(c.fields, 'Paid Date'),
  case staging.txt(c.fields, 'Payment Method')
    when 'Cash'          then 'cash'
    when 'Bank Transfer' then 'bank_transfer'
    when 'Other'         then 'other'
  end::payment_method,
  staging.txt(c.fields, 'Payment Reference'),
  staging.txt(c.fields, 'Notes'),
  c.id
from staging.at_charges c
join      students       st on st.airtable_id = staging.link1(c.fields, 'Student')
left join guardians      pa on pa.airtable_id = staging.link1(c.fields, 'Payer')
left join hours_packages hp on hp.airtable_id = staging.link1(c.fields, 'Hours')
left join attendance     at on at.airtable_id = staging.link1(c.fields, 'Attendance')
-- charge_one_source: exactly one source, or the row cannot be saved at all.
where (staging.txt(c.fields, 'Source Type') = 'Hours' and hp.id is not null)
   or (staging.txt(c.fields, 'Source Type') <> 'Hours' and at.id is not null)
order by staging.txt(c.fields, 'Charge Code'), c.created_time
on conflict (airtable_id) do nothing;

-- --------------------------------------------------------- 15. tutor_payouts
insert into tutor_payouts (
  tutor_id, fortnight_start, hours_worked, rate_at_payout, hours_adjustment,
  amount_adjustment, adjustment_reason, status, paid_date, method,
  payment_ref, notes
)
select
  t.id,
  staging.dt(p.fields, 'Fortnight Start'),
  coalesce(staging.num(p.fields, 'Hours Worked'), 0),
  coalesce(staging.num(p.fields, 'Rate at Payout'), 0),
  coalesce(staging.num(p.fields, 'Hours Adjustment'), 0),
  coalesce(staging.num(p.fields, 'Dollar Adjustment'), 0),
  staging.txt(p.fields, 'Adjustment Reason'),
  coalesce(lower(staging.txt(p.fields, 'Status')), 'draft')::payout_status,
  staging.dt(p.fields, 'Date Paid'),
  case staging.txt(p.fields, 'Payment Method')
    when 'Cash'          then 'cash'
    when 'Bank Transfer' then 'bank_transfer'
    when 'Other'         then 'other'
  end::payment_method,
  staging.txt(p.fields, 'Payment Reference'),
  staging.txt(p.fields, 'Notes')
from staging.at_payouts p
join tutors t on t.airtable_id = staging.link1(p.fields, 'Tutor')
where staging.dt(p.fields, 'Fortnight Start') is not null
on conflict (tutor_id, fortnight_start) do nothing;

-- ------------------------------------------------------- 16. reset sequences
-- Generated codes come off identity sequences. Without this the first record
-- created in the app collides with an imported one.
select setval(pg_get_serial_sequence('guardians','seq'),       coalesce((select max(seq) from guardians), 1));
select setval(pg_get_serial_sequence('students','seq'),        coalesce((select max(seq) from students), 1));
select setval(pg_get_serial_sequence('tutors','seq'),          coalesce((select max(seq) from tutors), 1));
select setval(pg_get_serial_sequence('class_offerings','seq'), coalesce((select max(seq) from class_offerings), 1));
select setval(pg_get_serial_sequence('enrolments','seq'),      coalesce((select max(seq) from enrolments), 1));
select setval(pg_get_serial_sequence('hours_packages','seq'),  coalesce((select max(seq) from hours_packages), 1));
select setval(pg_get_serial_sequence('sessions','seq'),        coalesce((select max(seq) from sessions), 1));
select setval(pg_get_serial_sequence('attendance','seq'),      coalesce((select max(seq) from attendance), 1));
select setval(pg_get_serial_sequence('charges','seq'),         coalesce((select max(seq) from charges), 1));
select setval(pg_get_serial_sequence('tutor_payouts','seq'),   coalesce((select max(seq) from tutor_payouts), 1));

commit;
