-- =============================================================================
-- Vision CRM — Postgres / Supabase schema
-- Runnable top to bottom on a fresh database.
--
-- Conventions:
--   * snake_case, plural table names
--   * uuid primary keys
--   * money  numeric(12,2)   hours numeric(6,2)
--   * all timestamps timestamptz (UTC), reasoned about in Australia/Sydney
--   * base tables store facts; every derived value lives in a view
--   * airtable_id preserved on every migrated table for reconciliation
-- =============================================================================

create extension if not exists "pgcrypto";

-- =============================================================================
-- 1. ENUMS
-- =============================================================================

create type staff_role         as enum ('owner', 'admin');

create type person_status      as enum ('active', 'inactive');

create type period_type        as enum ('standard_term', 'holiday_intensive', 'other');
create type period_status      as enum ('planned', 'active', 'closed');

create type pricing_basis      as enum ('per_hour', 'per_session', 'fixed_hours_price');
create type price_status       as enum ('active', 'inactive');

create type offering_type      as enum ('group_class', 'private_tuition');
create type offering_status    as enum ('planned', 'active', 'closed', 'cancelled');
create type recurrence_pattern as enum ('weekly', 'fortnightly', 'daily', 'one_off', 'ad_hoc');

create type session_status     as enum ('scheduled', 'completed', 'cancelled', 'rescheduled');
create type session_type       as enum ('regular', 'dedicated_make_up');

create type enrolment_status   as enum ('trial', 'active', 'closed');
create type billing_method     as enum ('hours', 'payg');
create type adjustment_type    as enum ('none', 'percentage', 'fixed_amount', 'final_price_override');
create type closure_reason     as enum ('completed', 'withdrawn', 'transferred', 'other');

create type package_type       as enum ('purchased', 'courtesy');
create type package_status     as enum ('draft', 'active', 'closed', 'expired');

create type attendance_type    as enum ('regular', 'trial', 'make_up');
create type attendance_status  as enum ('not_marked', 'present', 'absent');

create type charge_source      as enum ('hours', 'payg');
create type charge_route       as enum ('parent', 'internal');
create type charge_status      as enum ('to_invoice', 'invoiced', 'paid', 'cancelled');
create type payment_method     as enum ('cash', 'bank_transfer', 'other');

create type payout_status      as enum ('draft', 'approved', 'paid');

-- =============================================================================
-- 2. SHARED HELPERS
-- =============================================================================

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Sydney calendar date for an instant.
create or replace function syd_date(ts timestamptz) returns date
language sql stable as $$ select (ts at time zone 'Australia/Sydney')::date $$;

-- The Monday that opens the fortnight containing d, anchored to a fixed Monday.
-- floor() handles dates before the anchor correctly.
create or replace function fortnight_start(d date, anchor date default date '2026-08-03')
returns date language sql immutable as $$
  select anchor + (floor((d - anchor)::numeric / 14) * 14)::int
$$;

-- =============================================================================
-- 3. SETTINGS  (single row)
-- =============================================================================

create table app_settings (
  id                 boolean primary key default true check (id),
  org_name           text        not null default 'Vision Academics',
  timezone           text        not null default 'Australia/Sydney',
  fortnight_anchor   date        not null default date '2026-08-03',
  updated_at         timestamptz not null default now()
);
insert into app_settings default values;

-- =============================================================================
-- 4. STAFF / AUTH
-- =============================================================================

create table staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  full_name  text        not null,
  email      text        not null,
  role       staff_role  not null default 'admin',
  is_active  boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index staff_email_key on staff (lower(email));
create trigger staff_touch before update on staff
  for each row execute function set_updated_at();

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and is_active)
$$;

create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and is_active and role = 'owner')
$$;

-- =============================================================================
-- 5. PEOPLE
-- =============================================================================

create table guardians (
  id          uuid primary key default gen_random_uuid(),
  seq         bigint generated by default as identity,
  code        text generated always as ('GUA-' || lpad(seq::text, 4, '0')) stored,
  full_name   text          not null,
  email       text,
  mobile      text,
  status      person_status not null default 'active',
  notes       text,
  airtable_id text unique,
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now()
);
create unique index guardians_code_key on guardians (code);
create trigger guardians_touch before update on guardians
  for each row execute function set_updated_at();

create table students (
  id               uuid primary key default gen_random_uuid(),
  seq              bigint generated by default as identity,
  code             text generated always as ('STU-' || lpad(seq::text, 4, '0')) stored,
  full_name        text          not null,
  status           person_status not null default 'active',
  year_level       text,
  current_school   text,
  date_of_birth    date,
  joined_on        date,
  how_they_found_us text,
  -- must also appear in student_guardians; enforced by trg_default_payer_is_guardian
  default_payer_id uuid references guardians(id) on delete restrict,
  notes            text,
  airtable_id      text unique,
  created_at       timestamptz   not null default now(),
  updated_at       timestamptz   not null default now()
);
create unique index students_code_key on students (code);
create index students_default_payer_idx on students (default_payer_id);
create trigger students_touch before update on students
  for each row execute function set_updated_at();

create table student_guardians (
  student_id  uuid not null references students(id)  on delete cascade,
  guardian_id uuid not null references guardians(id) on delete restrict,
  relationship text,
  primary key (student_id, guardian_id)
);

-- The default payer must be one of the student's guardians.
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
-- Deferred so a student and their guardian link can be inserted in one transaction.
create constraint trigger trg_default_payer_is_guardian
  after insert or update of default_payer_id on students
  deferrable initially deferred
  for each row execute function check_default_payer_is_guardian();

create table tutors (
  id          uuid primary key default gen_random_uuid(),
  seq         bigint generated by default as identity,
  code        text generated always as ('TUT-' || lpad(seq::text, 4, '0')) stored,
  full_name   text          not null,
  email       text,
  mobile      text,
  status      person_status not null default 'active',
  colour      text,                       -- hex, for the timetable
  notes       text,
  airtable_id text unique,
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now()
);
create unique index tutors_code_key on tutors (code);
create trigger tutors_touch before update on tutors
  for each row execute function set_updated_at();

-- Pay rates live in their own table so they can be hidden from non-owners at the
-- row level, and so rate changes keep a history instead of overwriting.
create table tutor_pay_rates (
  id             uuid primary key default gen_random_uuid(),
  tutor_id       uuid           not null references tutors(id) on delete cascade,
  hourly_rate    numeric(12,2)  not null check (hourly_rate >= 0),
  effective_from date           not null,
  note           text,
  created_at     timestamptz    not null default now()
);
create unique index tutor_pay_rates_unique on tutor_pay_rates (tutor_id, effective_from);
create index tutor_pay_rates_tutor_idx on tutor_pay_rates (tutor_id, effective_from desc);

-- =============================================================================
-- 6. CATALOGUE
-- =============================================================================

create table operating_periods (
  id          uuid primary key default gen_random_uuid(),
  name        text          not null,
  code        text          not null unique,          -- e.g. 2026-T4
  period_type period_type   not null default 'standard_term',
  starts_on   date          not null,
  ends_on     date          not null,
  status      period_status not null default 'planned',
  airtable_id text unique,
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now(),
  constraint period_dates_ordered check (ends_on >= starts_on)
);
create trigger operating_periods_touch before update on operating_periods
  for each row execute function set_updated_at();

create table standard_prices (
  id             uuid primary key default gen_random_uuid(),
  name           text          not null,
  code           text          not null unique,
  year_group     text,
  scope          text,
  basis          pricing_basis not null,
  quantity       numeric(6,2)  not null check (quantity > 0),  -- hours or sessions per the basis
  unit_rate      numeric(12,2) not null check (unit_rate >= 0),
  effective_from date          not null,
  effective_to   date,
  status         price_status  not null default 'active',
  notes          text,
  airtable_id    text unique,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now(),
  constraint price_dates_ordered check (effective_to is null or effective_to >= effective_from)
);
create trigger standard_prices_touch before update on standard_prices
  for each row execute function set_updated_at();

create table programs (
  id                    uuid primary key default gen_random_uuid(),
  name                  text          not null,
  code                  text          not null unique,
  year_level            text,
  subject               text,
  exam_focus            text,
  default_offering_type offering_type,
  standard_duration_hours numeric(6,2) not null check (standard_duration_hours > 0),
  default_price_id      uuid references standard_prices(id) on delete set null,
  is_active             boolean       not null default true,
  notes                 text,
  airtable_id           text unique,
  created_at            timestamptz   not null default now(),
  updated_at            timestamptz   not null default now()
);
create trigger programs_touch before update on programs
  for each row execute function set_updated_at();

-- =============================================================================
-- 7. CLASSES AND LESSONS
-- =============================================================================

create table class_offerings (
  id                  uuid primary key default gen_random_uuid(),
  seq                 bigint generated by default as identity,
  code                text generated always as ('OFF-' || lpad(seq::text, 4, '0')) stored,
  program_id          uuid            not null references programs(id) on delete restrict,
  operating_period_id uuid            not null references operating_periods(id) on delete restrict,
  primary_tutor_id    uuid            references tutors(id) on delete restrict,
  offering_type       offering_type   not null,
  capacity            int             not null default 1 check (capacity > 0),
  starts_on           date            not null,
  ends_on             date            not null,
  recurrence          recurrence_pattern not null default 'weekly',
  -- Fixes both the weekday and the time of day that lessons generate at.
  recurrence_start    timestamptz,
  session_duration_hours numeric(6,2) not null check (session_duration_hours > 0),
  room                text,
  price_override      numeric(12,2),
  status              offering_status not null default 'planned',
  notes               text,
  airtable_id         text unique,
  created_at          timestamptz     not null default now(),
  updated_at          timestamptz     not null default now(),
  constraint offering_dates_ordered check (ends_on >= starts_on),
  constraint private_capacity_one check (offering_type <> 'private_tuition' or capacity = 1)
);
create unique index class_offerings_code_key on class_offerings (code);
create index class_offerings_period_idx on class_offerings (operating_period_id);
create index class_offerings_tutor_idx  on class_offerings (primary_tutor_id);
create trigger class_offerings_touch before update on class_offerings
  for each row execute function set_updated_at();

create table sessions (
  id                uuid primary key default gen_random_uuid(),
  seq               bigint generated by default as identity,
  code              text generated always as ('SES-' || lpad(seq::text, 4, '0')) stored,
  class_offering_id uuid           not null references class_offerings(id) on delete restrict,
  tutor_id          uuid           references tutors(id) on delete restrict,
  session_type      session_type   not null default 'regular',
  status            session_status not null default 'scheduled',
  starts_at         timestamptz    not null,
  ends_at           timestamptz    not null,
  room              text,
  replaces_session_id uuid         references sessions(id) on delete set null,
  notes             text,
  airtable_id       text unique,
  created_at        timestamptz    not null default now(),
  updated_at        timestamptz    not null default now(),
  constraint session_times_ordered check (ends_at > starts_at)
);
create unique index sessions_code_key on sessions (code);
-- Makes the old "regenerated and got duplicates" bug structurally impossible.
create unique index sessions_no_duplicates on sessions (class_offering_id, starts_at);
create index sessions_starts_idx on sessions (starts_at);
create index sessions_tutor_idx  on sessions (tutor_id, starts_at);
create trigger sessions_touch before update on sessions
  for each row execute function set_updated_at();

-- Owner-only. Per-lesson pay adjustments: a class ran long, or a bonus is owed.
create table session_pay_adjustments (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid          not null references sessions(id) on delete cascade,
  amount     numeric(12,2) not null,     -- may be negative
  note       text          not null check (length(btrim(note)) > 0),
  created_by uuid          references staff(user_id),
  created_at timestamptz   not null default now()
);
create index session_pay_adjustments_session_idx on session_pay_adjustments (session_id);

-- =============================================================================
-- 8. ENROLMENTS, PACKAGES
-- =============================================================================

create table enrolments (
  id                uuid primary key default gen_random_uuid(),
  seq               bigint generated by default as identity,
  code              text generated always as ('ENR-' || lpad(seq::text, 4, '0')) stored,
  student_id        uuid             not null references students(id) on delete restrict,
  class_offering_id uuid             not null references class_offerings(id) on delete restrict,
  status            enrolment_status not null default 'active',
  starts_on         date             not null,
  ends_on           date,
  closure           closure_reason,
  method            billing_method,                       -- null allowed only for trials
  -- Frozen commercial terms, copied at the moment of enrolling.
  standard_price_id uuid             references standard_prices(id) on delete set null,
  base_price        numeric(12,2),
  adjustment        adjustment_type  not null default 'none',
  adjustment_value  numeric(12,2)    not null default 0,
  hours_override    numeric(6,2),     -- required when the price basis is per_hour
  default_package_id uuid,            -- FK added after hours_packages exists
  notes             text,
  airtable_id       text unique,
  created_at        timestamptz      not null default now(),
  updated_at        timestamptz      not null default now(),
  constraint enrolment_dates_ordered check (ends_on is null or ends_on >= starts_on),
  constraint enrolment_method_required check (status = 'trial' or method is not null)
);
create unique index enrolments_code_key on enrolments (code);
create unique index enrolments_unique on enrolments (student_id, class_offering_id, starts_on);
create index enrolments_offering_idx on enrolments (class_offering_id);
create index enrolments_student_idx  on enrolments (student_id);
create trigger enrolments_touch before update on enrolments
  for each row execute function set_updated_at();

create table hours_packages (
  id             uuid primary key default gen_random_uuid(),
  seq            bigint generated by default as identity,
  code           text generated always as ('HRS-' || lpad(seq::text, 4, '0')) stored,
  student_id     uuid           not null references students(id) on delete restrict,
  package_type   package_type   not null default 'purchased',
  hours_purchased numeric(6,2)  not null check (hours_purchased > 0),
  price          numeric(12,2)  not null default 0 check (price >= 0),
  standard_price_id uuid        references standard_prices(id) on delete set null,
  approved_on    date           not null default (now() at time zone 'Australia/Sydney')::date,
  status         package_status not null default 'active',
  low_balance_threshold numeric(6,2) not null default 2,
  courtesy_reason text,
  admin_note     text,
  airtable_id    text unique,
  created_at     timestamptz    not null default now(),
  updated_at     timestamptz    not null default now(),
  constraint courtesy_is_free check (package_type <> 'courtesy'
      or (price = 0 and courtesy_reason is not null and length(btrim(courtesy_reason)) > 0)),
  constraint purchased_has_price check (package_type <> 'purchased' or price >= 0)
);
create unique index hours_packages_code_key on hours_packages (code);
create index hours_packages_student_idx on hours_packages (student_id);
create trigger hours_packages_touch before update on hours_packages
  for each row execute function set_updated_at();

alter table enrolments
  add constraint enrolments_default_package_fk
  foreign key (default_package_id) references hours_packages(id) on delete set null;

-- Which enrolments a package may be spent on. A student in two classes can share
-- one package across both, or hold separate packages.
create table package_eligibility (
  package_id   uuid not null references hours_packages(id) on delete cascade,
  enrolment_id uuid not null references enrolments(id)     on delete cascade,
  primary key (package_id, enrolment_id)
);

-- =============================================================================
-- 9. ATTENDANCE
-- =============================================================================

create table attendance (
  id            uuid primary key default gen_random_uuid(),
  seq           bigint generated by default as identity,
  code          text generated always as ('ATT-' || lpad(seq::text, 4, '0')) stored,
  session_id    uuid              not null references sessions(id)   on delete cascade,
  enrolment_id  uuid              not null references enrolments(id) on delete restrict,
  att_type      attendance_type   not null default 'regular',
  status        attendance_status not null default 'not_marked',
  package_id    uuid              references hours_packages(id) on delete set null,
  source_attendance_id uuid       references attendance(id) on delete set null,  -- the absence a make-up settles
  correction_note text,
  airtable_id   text unique,
  created_at    timestamptz       not null default now(),
  updated_at    timestamptz       not null default now(),
  constraint make_up_has_source check (att_type <> 'make_up' or source_attendance_id is not null)
);
create unique index attendance_code_key on attendance (code);
-- One roll entry per student per lesson.
create unique index attendance_unique on attendance (session_id, enrolment_id);
create index attendance_session_idx  on attendance (session_id);
create index attendance_package_idx  on attendance (package_id);
create index attendance_source_idx   on attendance (source_attendance_id);
create trigger attendance_touch before update on attendance
  for each row execute function set_updated_at();

-- A package may only be spent on an enrolment it is eligible for, and must belong
-- to the same student.
create or replace function check_package_eligible() returns trigger
language plpgsql as $$
begin
  if new.package_id is null then return new; end if;

  if not exists (
    select 1 from hours_packages p join enrolments e on e.id = new.enrolment_id
    where p.id = new.package_id and p.student_id = e.student_id
  ) then
    raise exception 'Hours package belongs to a different student than this enrolment';
  end if;

  if not exists (
    select 1 from package_eligibility pe
    where pe.package_id = new.package_id and pe.enrolment_id = new.enrolment_id
  ) then
    raise exception 'Hours package is not eligible for this enrolment';
  end if;

  return new;
end $$;
create trigger trg_package_eligible
  before insert or update of package_id, enrolment_id on attendance
  for each row execute function check_package_eligible();

-- =============================================================================
-- 10. MONEY
-- =============================================================================

create table charges (
  id              uuid primary key default gen_random_uuid(),
  seq             bigint generated by default as identity,
  charge_year     int not null default extract(year from (now() at time zone 'Australia/Sydney'))::int,
  code            text generated always as
                    ('CHG-' || charge_year::text || '-' || lpad(seq::text, 4, '0')) stored,
  student_id      uuid          not null references students(id)  on delete restrict,
  payer_id        uuid          references guardians(id) on delete restrict,
  source          charge_source not null,
  package_id      uuid          references hours_packages(id) on delete restrict,
  attendance_id   uuid          references attendance(id)     on delete restrict,
  standard_amount numeric(12,2) not null check (standard_amount >= 0),
  adjustment      numeric(12,2) not null default 0,          -- negative for a discount
  route           charge_route  not null default 'parent',
  status          charge_status not null default 'to_invoice',
  invoice_date    date,
  xero_invoice_no text,
  paid_date       date,
  method          payment_method,
  payment_ref     text,
  notes           text,
  airtable_id     text unique,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),
  -- Exactly one source. This is what prevents double billing.
  constraint charge_one_source check (
       (source = 'hours' and package_id is not null and attendance_id is null)
    or (source = 'payg'  and attendance_id is not null and package_id is null)
  ),
  constraint charge_parent_needs_payer check (route <> 'parent' or payer_id is not null),
  constraint charge_paid_needs_evidence check (
    status <> 'paid' or (paid_date is not null and method is not null)
  ),
  constraint charge_total_not_negative check (standard_amount + adjustment >= 0)
);
create unique index charges_code_key on charges (code);
create unique index charges_one_per_attendance on charges (attendance_id) where attendance_id is not null;
create unique index charges_one_per_package    on charges (package_id)    where package_id    is not null;
create index charges_status_idx on charges (status, invoice_date);
create trigger charges_touch before update on charges
  for each row execute function set_updated_at();

-- Owner-only.
create table tutor_payouts (
  id             uuid primary key default gen_random_uuid(),
  seq            bigint generated by default as identity,
  code           text generated always as ('PAY-' || lpad(seq::text, 4, '0')) stored,
  tutor_id       uuid          not null references tutors(id) on delete restrict,
  fortnight_start date         not null,
  -- Frozen at the moment of payment.
  hours_worked   numeric(6,2)  not null check (hours_worked >= 0),
  rate_at_payout numeric(12,2) not null check (rate_at_payout >= 0),
  hours_adjustment numeric(6,2) not null default 0,
  amount_adjustment numeric(12,2) not null default 0,
  adjustment_reason text,
  status         payout_status not null default 'draft',
  paid_date      date,
  method         payment_method,
  payment_ref    text,
  notes          text,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now(),
  constraint payout_unique_per_fortnight unique (tutor_id, fortnight_start),
  constraint payout_adjustment_needs_reason check (
    (hours_adjustment = 0 and amount_adjustment = 0)
    or (adjustment_reason is not null and length(btrim(adjustment_reason)) > 0)
  ),
  constraint payout_paid_needs_evidence check (
    status <> 'paid' or (paid_date is not null and method is not null)
  )
);
create unique index tutor_payouts_code_key on tutor_payouts (code);
create trigger tutor_payouts_touch before update on tutor_payouts
  for each row execute function set_updated_at();

-- =============================================================================
-- 11. VIEWS — everything derived
-- =============================================================================

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

-- =============================================================================
-- 12. ROW LEVEL SECURITY
-- =============================================================================

alter table staff                  enable row level security;
alter table app_settings           enable row level security;
alter table guardians              enable row level security;
alter table students               enable row level security;
alter table student_guardians      enable row level security;
alter table tutors                 enable row level security;
alter table tutor_pay_rates        enable row level security;
alter table operating_periods      enable row level security;
alter table standard_prices        enable row level security;
alter table programs               enable row level security;
alter table class_offerings        enable row level security;
alter table sessions               enable row level security;
alter table session_pay_adjustments enable row level security;
alter table enrolments             enable row level security;
alter table hours_packages         enable row level security;
alter table package_eligibility    enable row level security;
alter table attendance             enable row level security;
alter table charges                enable row level security;
alter table tutor_payouts          enable row level security;

-- Any active staff member: full access to operational data.
do $$
declare t text;
begin
  foreach t in array array[
    'guardians','students','student_guardians','tutors','operating_periods',
    'standard_prices','programs','class_offerings','sessions','enrolments',
    'hours_packages','package_eligibility','attendance','charges'
  ] loop
    execute format('create policy %I_staff_all on %I for all to authenticated
                    using (is_staff()) with check (is_staff())', t, t);
  end loop;
end $$;

-- Owners only: anything to do with what tutors are paid.
do $$
declare t text;
begin
  foreach t in array array['tutor_pay_rates','session_pay_adjustments','tutor_payouts'] loop
    execute format('create policy %I_owner_all on %I for all to authenticated
                    using (is_owner()) with check (is_owner())', t, t);
  end loop;
end $$;

-- Staff can read the roster; only owners can change it. Anyone can read their own row.
create policy staff_read     on staff for select to authenticated using (is_staff());
create policy staff_self     on staff for select to authenticated using (user_id = auth.uid());
create policy staff_owner_w  on staff for all    to authenticated
  using (is_owner()) with check (is_owner());

create policy settings_read  on app_settings for select to authenticated using (is_staff());
create policy settings_write on app_settings for all    to authenticated
  using (is_owner()) with check (is_owner());
