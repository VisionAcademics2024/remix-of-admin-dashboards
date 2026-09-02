-- =============================================================================
-- Billing: let a 'manual' charge exist with no package and no attendance.
--
-- The companion to the previous migration. charge_one_source stays exactly as
-- strict as it was for the two automatic sources - a PAYG charge must point at
-- one attendance row and nothing else, an hours charge at one package and
-- nothing else - and gains a third arm for the ad-hoc bill, which must point at
-- neither.
--
-- Stated as "neither", not "either or neither": a manual charge that carried a
-- package_id would slip past charges_one_per_package and let the same package
-- be billed twice.
-- =============================================================================

alter table charges drop constraint if exists charge_one_source;

alter table charges add constraint charge_one_source check (
     (source = 'hours'  and package_id is not null and attendance_id is null)
  or (source = 'payg'   and attendance_id is not null and package_id is null)
  or (source = 'manual' and package_id is null      and attendance_id is null)
);
