-- =============================================================================
-- Airtable import — people only: guardians, students, and who belongs to whom.
--
-- The same three steps that open 02-transform.sql, on their own, so the family
-- side of the base can go in first and be used while the rest is still being
-- worked out. Nothing here depends on classes, lessons, hours or money.
--
-- Runs as one transaction, and is re-runnable: every insert carries the
-- originating Airtable record ID and does nothing on a second pass. Running
-- the full 02-transform.sql afterwards picks up exactly where this left off —
-- it will skip these rows and go on to the rest.
--
-- Needs: 01-staging.sql, then the generated people data file.
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
-- This is what makes siblings work: one guardian row, several students.
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

-- ------------------------------------------------------------- sequence resets
-- The codes come out of per-table sequences. Leaving them at 1 means the next
-- student created in the app collides with an imported one.
select setval(pg_get_serial_sequence('guardians','seq'), coalesce((select max(seq) from guardians), 1));
select setval(pg_get_serial_sequence('students','seq'),  coalesce((select max(seq) from students),  1));

commit;
