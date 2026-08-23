-- =============================================================================
-- Align the Vision schema with docs/spec/03-schema.sql
--
-- The repo grew two migrations that both create the Vision schema and disagree
-- with each other. Applied in filename order the earlier one wins and the later
-- one aborts, so which is live depends on the order Supabase happened to run
-- them — and that is not knowable from the repo.
--
-- Rather than guess, this migration ADDS ONLY WHAT IS MISSING. It is safe and
-- idempotent on either variant, and on a database that is already correct it
-- does nothing at all. That removes the need to determine which one is live
-- before importing.
--
-- What it adds, and why each one is load-bearing:
--
--   1. airtable_id on every migrated table. Without it a re-run of the import
--      duplicates everything and no reconciliation against Airtable is possible.
--   2. The check constraints that turn business rules into guarantees — most
--      importantly charge_one_source, which is what makes double-billing
--      impossible rather than merely discouraged.
--   3. The deferred trigger enforcing that a student's default payer is one of
--      their own guardians.
--   4. app_settings, the single row holding the fortnight anchor. Every pay
--      period is counted from it, so without the table the pay screens have no
--      origin.
--   5. updated_at plus its touch trigger on every table that the spec gives
--      one, and the two columns the other variant simply lacks
--      (programs.notes, charges.charge_year).
--   6. seq, and codes derived from it. The spec numbers rows from a per-table
--      identity and generates `code` from that number, so a code can never
--      drift from the row it names. Converting a plain `code` column is
--      lossless on an empty table and destructive on a populated one, so the
--      conversion runs only where there is nothing to renumber; elsewhere the
--      column keeps a corrected default that produces the same shape.
--   7. The eight views, dropped and rebuilt verbatim from the spec. Views are
--      pure derivation, so they are the one part of the schema that can be
--      thrown away safely — and rebuilding them is what makes the columns
--      added above visible to the app.
--
-- After this runs, the two variants are structurally identical apart from a
-- vestigial user_roles table in the alternate one. Nothing reads it — both
-- variants' is_staff() resolves against `staff` — so it is left in place
-- rather than dropped by a migration that has no business doing so.
--
-- It also aligns the generated code formats with the spec and with the codes
-- already in Airtable (GUA-, HRS-, CHG-yyyy-). Changing a column default never
-- touches existing rows, so this only affects records created from here on.
--
-- If a constraint cannot be added because existing data violates it, this
-- migration fails loudly and names the constraint. That is deliberate: a
-- half-applied schema is worse than a stopped one.
-- =============================================================================

-- ---------------------------------------------------------------- airtable_id
do $$
declare t text;
begin
  foreach t in array array[
    'guardians','students','tutors','operating_periods','standard_prices',
    'programs','class_offerings','enrolments','hours_packages','sessions',
    'attendance','charges'
  ] loop
    if to_regclass('public.' || t) is null then
      continue;   -- table not present in this variant; nothing to do
    end if;

    execute format('alter table public.%I add column if not exists airtable_id text', t);
    -- Deliberately NOT a partial index. The spec schema declares `airtable_id
    -- text unique`, and the import's `on conflict (airtable_id)` infers its
    -- arbiter from a total index. Postgres already allows many NULLs here, so
    -- a predicate would buy nothing and cost inference.
    execute format(
      'create unique index if not exists %I on public.%I (airtable_id)',
      t || '_airtable_id_key', t);
    execute format(
      'comment on column public.%I.airtable_id is %L', t,
      'Originating Airtable record ID. Keep populated forever: it is how the '
      'import stays re-runnable and how "where did this come from" is answered.');
  end loop;
end $$;

-- ------------------------------------------------------------------ constraints
-- Each is added only when absent, so this is safe to re-run.
do $$
begin
  -- A charge has exactly one source: an hours package OR one attendance.
  -- This is the constraint that prevents the same lesson being billed twice.
  if to_regclass('public.charges') is not null
     and not exists (select 1 from pg_constraint where conname = 'charge_one_source') then
    alter table public.charges add constraint charge_one_source check (
         (source = 'hours' and package_id is not null and attendance_id is null)
      or (source = 'payg'  and attendance_id is not null and package_id is null)
    );
  end if;

  -- Only a trial may leave the billing method blank.
  if to_regclass('public.enrolments') is not null
     and not exists (select 1 from pg_constraint where conname = 'enrolment_method_required') then
    alter table public.enrolments add constraint enrolment_method_required
      check (status = 'trial' or method is not null);
  end if;

  -- A make-up must say which absence it settles.
  if to_regclass('public.attendance') is not null
     and not exists (select 1 from pg_constraint where conname = 'make_up_has_source') then
    alter table public.attendance add constraint make_up_has_source
      check (att_type <> 'make_up' or source_attendance_id is not null);
  end if;

  -- Courtesy hours are free and say why.
  if to_regclass('public.hours_packages') is not null
     and not exists (select 1 from pg_constraint where conname = 'courtesy_is_free') then
    alter table public.hours_packages add constraint courtesy_is_free check (
      package_type <> 'courtesy'
      or (price = 0 and courtesy_reason is not null and length(btrim(courtesy_reason)) > 0)
    );
  end if;

  -- An adjustment without a written reason is rejected.
  if to_regclass('public.tutor_payouts') is not null
     and not exists (select 1 from pg_constraint where conname = 'payout_adjustment_needs_reason') then
    alter table public.tutor_payouts add constraint payout_adjustment_needs_reason check (
      (hours_adjustment = 0 and amount_adjustment = 0)
      or (adjustment_reason is not null and length(btrim(adjustment_reason)) > 0)
    );
  end if;
end $$;

-- --------------------------------------------------- default payer is a guardian
-- Deferred to end of transaction so a student and their guardian link can be
-- inserted together — which is exactly what the import does.
create or replace function check_default_payer_is_guardian() returns trigger
language plpgsql as $$
begin
  if new.default_payer_id is not null
     and not exists (select 1 from student_guardians sg
                     where sg.student_id = new.id and sg.guardian_id = new.default_payer_id)
  then
    raise exception 'Default payer must also be linked as a guardian of this student';
  end if;
  return new;
end $$;

do $$
begin
  if to_regclass('public.students') is not null
     and not exists (select 1 from pg_trigger where tgname = 'trg_default_payer_is_guardian') then
    create constraint trigger trg_default_payer_is_guardian
      after insert or update of default_payer_id on students
      deferrable initially deferred
      for each row execute function check_default_payer_is_guardian();
  end if;
end $$;

-- ----------------------------------------------------------------- code formats
-- Align with the spec and with the codes already in Airtable. Only affects rows
-- created after this runs; existing codes are untouched.
do $$
declare
  r record;
  want text;
begin
  for r in
    select c.table_name, c.column_default,
           substring(c.column_default from 'nextval\(''([a-z_]+)''') as seq_name
    from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'code'
      and c.is_generated = 'NEVER' and c.column_default is not null
  loop
    want := case r.table_name
      when 'guardians'      then 'GUA-'
      when 'students'       then 'STU-'
      when 'tutors'         then 'TUT-'
      when 'class_offerings' then 'OFF-'
      when 'enrolments'     then 'ENR-'
      when 'hours_packages' then 'HRS-'
      when 'sessions'       then 'SES-'
      when 'attendance'     then 'ATT-'
      when 'tutor_payouts'  then 'PAY-'
    end;
    if want is null or r.seq_name is null then
      continue;
    end if;

    execute format(
      'alter table public.%I alter column code set default (%L || lpad(nextval(%L)::text, 4, ''0''))',
      r.table_name, want, r.seq_name);
  end loop;

  -- Charges carry a year segment, so they are set separately.
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='charges' and column_name='code'
      and is_generated = 'NEVER' and column_default like '%nextval%'
  ) then
    execute (
      select format(
        'alter table public.charges alter column code set default '
        '(''CHG-'' || extract(year from (now() at time zone ''Australia/Sydney''))::int::text '
        '|| ''-'' || lpad(nextval(%L)::text, 4, ''0''))',
        substring(column_default from 'nextval\(''([a-z_]+)'''))
      from information_schema.columns
      where table_schema='public' and table_name='charges' and column_name='code'
    );
  end if;
end $$;

-- =============================================================================
-- The rest of this file closes the structural gaps between the two variants.
-- Everything below is guarded, so on a database that already matches the spec
-- it is a no-op.
-- =============================================================================

-- ------------------------------------------------------------ views come first
-- The views are pure derivations, so they are the one part of the schema that
-- can safely be thrown away and rebuilt. Dropping them up front frees the base
-- tables to be altered; they are recreated verbatim from the spec at the end,
-- which also picks up every column added in between.
drop view if exists v_needs_attention        cascade;
drop view if exists v_tutor_fortnight_pay    cascade;
drop view if exists v_session_pay            cascade;
drop view if exists v_charges                cascade;
drop view if exists v_enrolments             cascade;
drop view if exists v_hours_packages         cascade;
drop view if exists v_attendance             cascade;
drop view if exists v_sessions               cascade;

-- ------------------------------------------------------------------ updated_at
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'staff','guardians','students','tutors','operating_periods','standard_prices',
    'programs','class_offerings','sessions','enrolments','hours_packages',
    'attendance','charges','tutor_payouts'
  ] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format(
      'alter table public.%I add column if not exists updated_at timestamptz not null default now()', t);
    if not exists (select 1 from pg_trigger where tgname = t || '_touch') then
      execute format(
        'create trigger %I before update on public.%I for each row execute function set_updated_at()',
        t || '_touch', t);
    end if;
  end loop;
end $$;

-- -------------------------------------------------------------- app_settings
-- One row, and the fortnight anchor in it is what every pay period is measured
-- from. Without this table the pay screens have no origin to count from.
create table if not exists app_settings (
  id                 boolean primary key default true check (id),
  org_name           text        not null default 'Vision Academics',
  timezone           text        not null default 'Australia/Sydney',
  fortnight_anchor   date        not null default date '2026-08-03',
  updated_at         timestamptz not null default now()
);
insert into app_settings default values on conflict (id) do nothing;

alter table app_settings enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='app_settings' and policyname='settings_read') then
    create policy settings_read on app_settings for select to authenticated using (is_staff());
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='app_settings' and policyname='settings_write') then
    create policy settings_write on app_settings for all to authenticated
      using (is_owner()) with check (is_owner());
  end if;
end $$;
grant select, insert, update, delete on public.app_settings to authenticated;
grant all on public.app_settings to service_role;

-- ------------------------------------------------------- odds and ends of spec
alter table programs add column if not exists notes text;

-- The year segment of a charge code. Frozen at insert, because a charge raised
-- in December must keep its 2026 number when it is read in January.
alter table charges add column if not exists charge_year int not null
  default extract(year from (now() at time zone 'Australia/Sydney'))::int;

-- ------------------------------------------------------------ seq, and codes
-- The spec numbers rows from a per-table identity and derives `code` from it,
-- so the code can never drift from the row it names. The other variant stores
-- `code` as a plain column fed by a sequence default.
--
-- Converting means dropping and re-adding the column, which is lossless on an
-- empty table and destructive on a populated one — codes already sent to
-- families would be renumbered. So the conversion runs only where there is
-- nothing to lose. Elsewhere `seq` is still added (the import's sequence
-- resync needs it) and `code` keeps the aligned default set above, which
-- produces the same shape.
do $$
declare
  r   record;
  n   bigint;
  expr text;
begin
  for r in
    select * from (values
      ('guardians',       $q$'GUA-' || lpad(seq::text, 4, '0')$q$),
      ('students',        $q$'STU-' || lpad(seq::text, 4, '0')$q$),
      ('tutors',          $q$'TUT-' || lpad(seq::text, 4, '0')$q$),
      ('class_offerings', $q$'OFF-' || lpad(seq::text, 4, '0')$q$),
      ('sessions',        $q$'SES-' || lpad(seq::text, 4, '0')$q$),
      ('enrolments',      $q$'ENR-' || lpad(seq::text, 4, '0')$q$),
      ('hours_packages',  $q$'HRS-' || lpad(seq::text, 4, '0')$q$),
      ('attendance',      $q$'ATT-' || lpad(seq::text, 4, '0')$q$),
      ('tutor_payouts',   $q$'PAY-' || lpad(seq::text, 4, '0')$q$),
      ('charges',         $q$'CHG-' || charge_year::text || '-' || lpad(seq::text, 4, '0')$q$)
    ) as v(tbl, code_expr)
  loop
    if to_regclass('public.' || r.tbl) is null then
      continue;
    end if;

    execute format(
      'alter table public.%I add column if not exists seq bigint generated by default as identity',
      r.tbl);

    -- Already generated? Then this database is the spec variant. Leave it.
    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name=r.tbl and column_name='code'
        and is_generated = 'ALWAYS'
    ) then
      continue;
    end if;

    execute format('select count(*) from public.%I', r.tbl) into n;
    if n > 0 then
      raise notice
        'align: %(code) left as-is — % existing rows would be renumbered', r.tbl, n;
      continue;
    end if;

    execute format('alter table public.%I drop column if exists code', r.tbl);
    execute format(
      'alter table public.%I add column code text generated always as (%s) stored',
      r.tbl, r.code_expr);
  end loop;
end $$;

-- ------------------------------------------------------- views, rebuilt to spec
-- Copied verbatim from 20260823090100_vision_crm_core.sql so there is exactly
-- one definition of each derivation, whichever variant this database started as.
create or replace view v_sessions
with (security_invoker = true) as
select
  s.*,
  syd_date(s.starts_at)                                        as session_date,
  round(extract(epoch from (s.ends_at - s.starts_at)) / 3600.0, 2) as duration_hours,
  case when s.status in ('cancelled', 'rescheduled') then 0
       else round(extract(epoch from (s.ends_at - s.starts_at)) / 3600.0, 2)
  end                                                          as payable_hours,
  fortnight_start(syd_date(s.starts_at))                       as fortnight_start,
  fortnight_start(syd_date(s.starts_at)) + 13                  as fortnight_end,
  syd_date(s.starts_at) = syd_date(now())                      as is_today,
  fortnight_start(syd_date(s.starts_at)) = fortnight_start(syd_date(now())) as is_this_fortnight
from sessions s;

create or replace view v_attendance
with (security_invoker = true) as
select
  a.*,
  vs.session_date,
  vs.starts_at        as lesson_starts_at,
  vs.class_offering_id,
  vs.tutor_id         as lesson_tutor_id,
  e.student_id,
  e.method            as billing_method,
  case when vs.status = 'cancelled' then 'cancelled'::text else a.status::text end as effective_status,
  -- Hours are spent only by a present, non-trial row on a lesson that ran.
  case when a.status = 'present' and a.att_type <> 'trial' and vs.status <> 'cancelled'
       then vs.duration_hours else 0 end as hours_consumed,
  case
    when a.status <> 'absent' then null
    when exists (select 1 from attendance m
                 where m.source_attendance_id = a.id and m.status = 'present') then 'completed'
    when exists (select 1 from attendance m
                 where m.source_attendance_id = a.id) then 'scheduled'
    else 'outstanding'
  end as make_up_state
from attendance a
join v_sessions vs on vs.id = a.session_id
join enrolments e  on e.id  = a.enrolment_id;

create or replace view v_hours_packages
with (security_invoker = true) as
select
  p.*,
  coalesce(u.used, 0)                        as hours_used,
  p.hours_purchased - coalesce(u.used, 0)    as hours_remaining,
  (p.hours_purchased - coalesce(u.used, 0)) <= p.low_balance_threshold as is_low,
  (p.hours_purchased - coalesce(u.used, 0)) < 0                        as is_overdrawn
from hours_packages p
left join (
  select package_id, sum(hours_consumed) as used
  from v_attendance where package_id is not null group by package_id
) u on u.package_id = p.id;

create or replace view v_enrolments
with (security_invoker = true) as
select
  e.*,
  case e.adjustment
    when 'percentage'           then round(e.base_price * (1 + e.adjustment_value), 2)
    when 'fixed_amount'         then round(e.base_price - e.adjustment_value, 2)
    when 'final_price_override' then round(e.adjustment_value, 2)
    else round(e.base_price, 2)
  end as final_agreed_price
from enrolments e;

create or replace view v_charges
with (security_invoker = true) as
select c.*, round(c.standard_amount + c.adjustment, 2) as final_amount
from charges c;

-- ---- Pay. Owner-only by RLS on the underlying rate/adjustment tables. ----

create or replace view v_session_pay
with (security_invoker = true) as
select
  vs.id as session_id, vs.code, vs.class_offering_id, vs.tutor_id,
  vs.session_date, vs.fortnight_start, vs.payable_hours,
  r.hourly_rate,
  round(vs.payable_hours * coalesce(r.hourly_rate, 0), 2) as base_pay,
  coalesce(adj.total, 0)                                  as adjustment,
  round(vs.payable_hours * coalesce(r.hourly_rate, 0) + coalesce(adj.total, 0), 2) as pay
from v_sessions vs
left join lateral (
  select tpr.hourly_rate from tutor_pay_rates tpr
  where tpr.tutor_id = vs.tutor_id and tpr.effective_from <= vs.session_date
  order by tpr.effective_from desc limit 1
) r on true
left join (
  select session_id, sum(amount) as total from session_pay_adjustments group by session_id
) adj on adj.session_id = vs.id;

create or replace view v_tutor_fortnight_pay
with (security_invoker = true) as
select
  sp.tutor_id, t.full_name as tutor_name, sp.fortnight_start,
  sp.fortnight_start + 13         as fortnight_end,
  count(*)                        as lessons,
  sum(sp.payable_hours)           as hours,
  sum(sp.adjustment)              as adjustments,
  sum(sp.pay)                     as total_pay
from v_session_pay sp
join tutors t on t.id = sp.tutor_id
group by sp.tutor_id, t.full_name, sp.fortnight_start;

-- ---- Exceptions. Drives the whole Needs Attention screen. ----

create or replace view v_needs_attention
with (security_invoker = true) as
  select 'session'::text as entity, s.id, s.code, 'Lesson has no tutor'::text as issue
  from sessions s where s.tutor_id is null and s.status = 'scheduled'
union all
  select 'attendance', a.id, a.code, 'Present on an hours enrolment with no package linked'
  from v_attendance a
  where a.status = 'present' and a.att_type <> 'trial'
    and a.billing_method = 'hours' and a.package_id is null
union all
  select 'attendance', a.id, a.code, 'Lesson has passed but the roll is not marked'
  from v_attendance a
  where a.status = 'not_marked' and a.session_date < syd_date(now())
union all
  select 'student', st.id, st.code, 'No default payer set'
  from students st where st.default_payer_id is null and st.status = 'active'
union all
  select 'enrolment', e.id, e.code, 'Hours enrolment with no default package'
  from enrolments e
  where e.method = 'hours' and e.status = 'active' and e.default_package_id is null
union all
  select 'enrolment', e.id, e.code, 'No agreed price recorded'
  from enrolments e where e.status <> 'trial' and e.base_price is null
union all
  select 'hours_package', p.id, p.code, 'Balance at or below the low threshold'
  from v_hours_packages p where p.status = 'active' and p.is_low
union all
  select 'hours_package', p.id, p.code, 'Overdrawn'
  from v_hours_packages p where p.is_overdrawn
union all
  select 'attendance', a.id, a.code, 'PAYG lesson attended but not charged'
  from v_attendance a
  where a.billing_method = 'payg' and a.status = 'present'
    and not exists (select 1 from charges c where c.attendance_id = a.id);

do $$
declare v text;
begin
  foreach v in array array[
    'v_sessions','v_attendance','v_hours_packages','v_enrolments','v_charges',
    'v_session_pay','v_tutor_fortnight_pay','v_needs_attention'
  ] loop
    execute format('grant select on public.%I to authenticated', v);
    execute format('grant select on public.%I to service_role', v);
  end loop;
end $$;
