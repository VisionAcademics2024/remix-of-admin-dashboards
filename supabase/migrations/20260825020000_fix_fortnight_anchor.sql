-- Realign the fortnight anchor.
--
-- Two fortnight_start() functions have coexisted:
--   * fortnight_start(d date)              anchored to 2024-01-01  (the original)
--   * fortnight_start(d date, anchor date) anchored to 2026-08-03  (the current)
--
-- v_sessions calls fortnight_start(syd_date(starts_at)) with a single argument,
-- which Postgres resolves to the single-argument function — the one anchored to
-- 2024-01-01. So the fortnight_start column on v_sessions has been landing two
-- weeks off from the fortnight the app computes (anchored to 2026-08-03), which
-- is why Tutor Pay could report "no lessons in this fortnight" while the
-- timetable — filtered by timestamp, not fortnight_start — was full.
--
-- CREATE OR REPLACE keeps the function's identity, so v_sessions keeps working;
-- it just now measures from the same anchor the two-argument version and the
-- front end use. The two land on identical results afterwards.
--
-- The app no longer depends on this (Tutor Pay filters by session_date, which
-- carries no anchor), but fixing the function keeps the stored fortnight_start
-- and is_this_fortnight columns correct for anything that reads them.

create or replace function public.fortnight_start(d date)
returns date language sql immutable as $$
  select date '2026-08-03' + (floor((d - date '2026-08-03')::numeric / 14) * 14)::int
$$;
