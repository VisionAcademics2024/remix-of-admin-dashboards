-- =============================================================================
-- Airtable import — preflight
--
-- Read-only. Run this FIRST, against the database you intend to import into.
--
-- Why it exists: the repo contains two migrations that both create the Vision
-- schema, and they disagree with each other.
--
--   20260823074753_ed256d3c…   plain `code` columns with per-table sequences,
--                              no airtable_id, fewer constraints
--   20260823090100_vision_crm  the spec schema: generated codes, airtable_id
--                              on every table, the full constraint set
--
-- Applied in filename order the first one wins and the second fails outright,
-- so which one is live depends on the order Supabase actually ran them. This
-- reports what is really there.
-- =============================================================================

\echo '=== Which Vision schema is live? ==='
select
  case
    when (select count(*) from information_schema.columns
          where table_schema = 'public' and column_name = 'airtable_id') >= 12
      then 'SPEC SCHEMA — airtable_id present. The import can run as written.'
    when (select count(*) from information_schema.tables
          where table_schema = 'public' and table_name = 'enrolments') = 1
      then 'ALTERNATE SCHEMA — Vision tables exist but airtable_id does not. '
           || 'The import needs the alignment migration first. Send me this output.'
    else 'NO VISION SCHEMA — the core migration has not been applied at all.'
  end as verdict;

\echo ''
\echo '=== Evidence ==='
select 'tables with airtable_id'      as item, count(*)::text as value
  from information_schema.columns where table_schema='public' and column_name='airtable_id'
union all
select 'tables with a seq column', count(*)::text
  from information_schema.columns where table_schema='public' and column_name='seq'
union all
select 'code columns that are generated', count(*)::text
  from information_schema.columns
  where table_schema='public' and column_name='code' and is_generated = 'ALWAYS'
union all
select 'charge_one_source constraint', case when exists (
    select 1 from pg_constraint where conname = 'charge_one_source') then 'present' else 'MISSING' end
union all
select 'default-payer trigger', case when exists (
    select 1 from pg_trigger where tgname = 'trg_default_payer_is_guardian') then 'present' else 'MISSING' end
union all
select 'enrolment_method_required', case when exists (
    select 1 from pg_constraint where conname = 'enrolment_method_required') then 'present' else 'MISSING' end
union all
select 'make_up_has_source', case when exists (
    select 1 from pg_constraint where conname = 'make_up_has_source') then 'present' else 'MISSING' end;

\echo ''
\echo '=== Code formats in use ==='
select table_name, coalesce(column_default, '(generated)') as code_source
from information_schema.columns
where table_schema = 'public' and column_name = 'code'
order by table_name;

\echo ''
\echo '=== Is there data already? Importing on top of real rows is not safe. ==='
select 'students' as t, count(*) from students
union all select 'enrolments', count(*) from enrolments
union all select 'sessions',   count(*) from sessions
union all select 'attendance', count(*) from attendance
union all select 'charges',    count(*) from charges
order by t;
