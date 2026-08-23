-- =============================================================================
-- Airtable import — preflight
--
-- Read-only. Nothing is created, altered or deleted. Safe against production.
--
-- HOW TO RUN: paste the whole file into the Supabase SQL editor
-- (Dashboard → SQL Editor → New query → Run) and send back the result.
-- It is one statement returning one table, so it works there as well as in
-- psql. Deliberately no \echo — those are psql-only and fail in the editor.
--
-- WHY: the repo contains two migrations that both create the Vision schema and
-- disagree with each other.
--
--   20260823074753_ed256d3c…   plain `code` columns + per-table sequences,
--                              no airtable_id, several constraints missing
--   20260823090100_vision_crm  the spec schema: generated codes, airtable_id
--                              everywhere, the full constraint set
--
-- Applied in filename order the first wins and the second fails outright with
-- "type staff_role already exists". Which one is actually live depends on the
-- order Supabase ran them, and that cannot be read off the repo.
-- =============================================================================

with facts as (
  select
    (select count(*) from information_schema.columns
      where table_schema = 'public' and column_name = 'airtable_id')          as airtable_id_cols,
    (select count(*) from information_schema.columns
      where table_schema = 'public' and column_name = 'seq')                  as seq_cols,
    (select count(*) from information_schema.columns
      where table_schema = 'public' and column_name = 'code'
        and is_generated = 'ALWAYS')                                          as generated_codes,
    (select count(*) from information_schema.tables
      where table_schema = 'public' and table_name = 'enrolments')            as has_enrolments,
    (select count(*) from pg_constraint where conname = 'charge_one_source')  as c_one_source,
    (select count(*) from pg_constraint where conname = 'enrolment_method_required') as c_method,
    (select count(*) from pg_constraint where conname = 'make_up_has_source') as c_makeup,
    (select count(*) from pg_constraint where conname = 'courtesy_is_free')   as c_courtesy,
    (select count(*) from pg_trigger where tgname = 'trg_default_payer_is_guardian') as t_payer
)
select 1 as ord, 'VERDICT' as item,
  case
    when has_enrolments = 0
      then 'NO VISION SCHEMA — the core migration has not been applied at all.'
    when airtable_id_cols >= 12
      then 'SPEC SCHEMA — airtable_id is present. The import can run as written.'
    else 'ALTERNATE SCHEMA — Vision tables exist but airtable_id does not. '
         || 'An alignment migration is needed before the import. Send this output back.'
  end as value
from facts
union all select 2, 'tables with airtable_id',        airtable_id_cols::text from facts
union all select 3, 'tables with a seq column',       seq_cols::text from facts
union all select 4, 'generated code columns',         generated_codes::text from facts
union all select 5, 'charge_one_source',        case when c_one_source > 0 then 'present' else 'MISSING' end from facts
union all select 6, 'enrolment_method_required', case when c_method    > 0 then 'present' else 'MISSING' end from facts
union all select 7, 'make_up_has_source',        case when c_makeup    > 0 then 'present' else 'MISSING' end from facts
union all select 8, 'courtesy_is_free',          case when c_courtesy  > 0 then 'present' else 'MISSING' end from facts
union all select 9, 'default-payer trigger',     case when t_payer     > 0 then 'present' else 'MISSING' end from facts

-- Code formats currently in force, so I can tell whether imported codes would
-- match what Airtable already has.
union all
select 20, 'code format · ' || table_name,
       coalesce(substring(column_default from '''([A-Z]+-)'''), '(generated)')
from information_schema.columns
where table_schema = 'public' and column_name = 'code'

-- Existing rows. Importing on top of real data is not safe, so this has to be
-- zero (or knowingly disposable) before anything runs.
union all
select 40, 'existing rows · students',   (select count(*)::text from students)
union all
select 41, 'existing rows · enrolments', (select count(*)::text from enrolments)
union all
select 42, 'existing rows · sessions',   (select count(*)::text from sessions)
union all
select 43, 'existing rows · attendance', (select count(*)::text from attendance)
union all
select 44, 'existing rows · charges',    (select count(*)::text from charges)
order by ord, item;
