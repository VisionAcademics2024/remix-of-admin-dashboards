-- =============================================================================
-- Airtable import — people only: check what landed.
--
-- Read-only. Run it straight after 02a-transform-people.sql.
-- =============================================================================

-- === 1. Everything came across ===
select 'guardians'         as table_name, (select count(*) from guardians)         as loaded,
       (select count(*) from staging.at_guardians) as airtable
union all
select 'students',          (select count(*) from students),
       (select count(*) from staging.at_students)
union all
select 'student ↔ guardian links', (select count(*) from student_guardians), null;

-- === 2. Anything that did not ===
select 'guardian' as kind, staging.txt(g.fields,'Guardian Code') as code, staging.txt(g.fields,'Full Name') as name
from staging.at_guardians g
where not exists (select 1 from guardians x where x.airtable_id = g.id)
union all
select 'student', staging.txt(s.fields,'Student Code'), staging.txt(s.fields,'Student Name')
from staging.at_students s
where not exists (select 1 from students x where x.airtable_id = s.id)
order by kind, code;

-- === 3. Students with no family attached ===
-- Nothing can be billed for these until a guardian is linked and made payer.
select st.code, st.full_name, st.status
from students st
where not exists (select 1 from student_guardians sg where sg.student_id = st.id)
order by st.code;

-- === 4. Students with no default payer ===
select st.code, st.full_name,
       (select count(*) from student_guardians sg where sg.student_id = st.id) as guardians_linked
from students st
where st.default_payer_id is null
order by st.code;

-- === 5. Families: which guardians cover more than one student ===
-- This is the sibling relationship, and the reason guardians are shared rather
-- than copied onto each child.
select g.code, g.full_name as guardian, count(*) as students,
       string_agg(st.full_name, ', ' order by st.full_name) as children
from guardians g
join student_guardians sg on sg.guardian_id = g.id
join students st on st.id = sg.student_id
group by g.code, g.full_name
having count(*) > 1
order by count(*) desc, g.code;

-- === 6. Contact detail worth a look ===
-- Names of one or two characters are almost certainly truncated in Airtable,
-- and a guardian with neither email nor mobile cannot be contacted at all.
select g.code, g.full_name,
       case when length(btrim(g.full_name)) <= 2 then 'Name looks truncated' end as name_flag,
       case when g.email is null and g.mobile is null then 'No email and no mobile' end as contact_flag
from guardians g
where length(btrim(g.full_name)) <= 2 or (g.email is null and g.mobile is null)
order by g.code;
