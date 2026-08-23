-- =============================================================================
-- Airtable import — step 1 of 3: staging
--
-- Raw Airtable records land here untouched. Nothing is transformed on the way
-- in, so a surprise value is never silently lost and the transform can be
-- re-run as many times as you like without going back to Airtable.
--
-- Safe to run repeatedly: it drops and recreates the staging schema only.
-- Nothing in public is touched.
-- =============================================================================

drop schema if exists staging cascade;
create schema staging;

-- One table per Airtable table. `fields` is the record's fields object exactly
-- as the API returned it; `created_time` is used to order code generation so
-- the new codes follow the order records were made in Airtable.
create table staging.at_guardians  (id text primary key, created_time timestamptz, fields jsonb not null);
create table staging.at_students   (id text primary key, created_time timestamptz, fields jsonb not null);
create table staging.at_tutors     (id text primary key, created_time timestamptz, fields jsonb not null);
create table staging.at_periods    (id text primary key, created_time timestamptz, fields jsonb not null);
create table staging.at_prices     (id text primary key, created_time timestamptz, fields jsonb not null);
create table staging.at_programs   (id text primary key, created_time timestamptz, fields jsonb not null);
create table staging.at_offerings  (id text primary key, created_time timestamptz, fields jsonb not null);
create table staging.at_billing    (id text primary key, created_time timestamptz, fields jsonb not null);
create table staging.at_hours      (id text primary key, created_time timestamptz, fields jsonb not null);
create table staging.at_sessions   (id text primary key, created_time timestamptz, fields jsonb not null);
create table staging.at_attendance (id text primary key, created_time timestamptz, fields jsonb not null);
create table staging.at_charges    (id text primary key, created_time timestamptz, fields jsonb not null);
create table staging.at_payouts    (id text primary key, created_time timestamptz, fields jsonb not null);

-- The first element of an Airtable link array, which is how a to-one
-- relationship comes back. Returns null for an empty or absent link.
create or replace function staging.link1(f jsonb, key text) returns text
language sql immutable as $$
  select nullif(f -> key ->> 0, '')
$$;

-- Text that is present and not blank, else null.
create or replace function staging.txt(f jsonb, key text) returns text
language sql immutable as $$
  select nullif(btrim(coalesce(f ->> key, '')), '')
$$;

create or replace function staging.num(f jsonb, key text) returns numeric
language sql immutable as $$
  select nullif(btrim(coalesce(f ->> key, '')), '')::numeric
$$;

create or replace function staging.dt(f jsonb, key text) returns date
language sql immutable as $$
  select nullif(btrim(coalesce(f ->> key, '')), '')::date
$$;

create or replace function staging.ts(f jsonb, key text) returns timestamptz
language sql immutable as $$
  select nullif(btrim(coalesce(f ->> key, '')), '')::timestamptz
$$;
