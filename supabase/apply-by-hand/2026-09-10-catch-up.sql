-- =============================================================================
-- The SQL this database is missing.
--
-- The app's migrations live in supabase/migrations and are meant to run
-- automatically. This one file is for when they have not: it is the same SQL,
-- written to be pasted straight into the Supabase SQL editor and safe to run
-- twice.
--
--   Supabase dashboard -> SQL Editor -> New query -> paste a step -> Run.
--
-- Run the steps in order, and run STEP 1 ON ITS OWN. Postgres will not let a
-- brand-new enum label be used by another statement until the transaction that
-- added it has committed, and the SQL editor runs everything you paste as one
-- transaction. Pasting steps 1 and 2 together fails with "unsafe use of new
-- value of enum type".
-- =============================================================================


-- -----------------------------------------------------------------------------
-- STEP 1 - paste and run this alone.
--
-- Fixes: New bill -> Raise the bill -> "invalid input value for enum
-- charge_source: manual".
--
-- Every charge used to have to hang off one of two things: an attendance row
-- (PAYG) or an hours package. 'manual' is the third kind - a resource fee, a
-- catch-up arranged off the timetable, a deposit - which points at neither.
-- (supabase/migrations/20260902000000_manual_charge_source.sql)
-- -----------------------------------------------------------------------------

alter type charge_source add value if not exists 'manual';


-- -----------------------------------------------------------------------------
-- STEP 2 - run this after step 1 has finished.
--
-- The check constraint still refuses a charge with no package and no
-- attendance, so without this a manual bill is rejected a second time. It stays
-- exactly as strict as it was for the two automatic sources; the third arm is
-- "neither", not "either or neither", because a manual charge carrying a
-- package_id would let the same package be billed twice.
-- (supabase/migrations/20260902000100_manual_charge_constraint.sql)
-- -----------------------------------------------------------------------------

alter table charges drop constraint if exists charge_one_source;

alter table charges add constraint charge_one_source check (
     (source = 'hours'  and package_id is not null and attendance_id is null)
  or (source = 'payg'   and attendance_id is not null and package_id is null)
  or (source = 'manual' and package_id is null      and attendance_id is null)
);


-- -----------------------------------------------------------------------------
-- STEP 3 - unrelated to billing, and also still pending.
--
-- Makes "This lesson has no roll entry for this student" appear on Needs
-- Attention when a student is enrolled in a class but missing from one of its
-- lessons. Without it that gap is silent: they vanish from the roll, no hours
-- are drawn, and nothing is billed.
--
-- It is a view replacement, so run the whole file as it stands:
--   supabase/migrations/20260907010000_missing_roll_entry.sql
-- Open that file, copy all of it, paste, Run. Safe to re-run.
-- -----------------------------------------------------------------------------
