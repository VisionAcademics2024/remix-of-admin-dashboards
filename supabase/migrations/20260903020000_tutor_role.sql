-- =============================================================================
-- A third kind of account: the tutor.
--
-- staff_role has meant "owner or admin" since the beginning, and every policy
-- in the system is written against is_staff(), which asks only whether an
-- active staff row exists. Adding a tutor to that table as it stands would hand
-- them read and write on every student, every charge and every invoice in the
-- business.
--
-- So the value is added here on its own. Postgres will not let a new enum value
-- be used in the same transaction that creates it, and nothing should be
-- written against this one until the policies in the next migration have
-- narrowed what a staff row means.
-- =============================================================================

alter type staff_role add value if not exists 'tutor';
