-- A lesson dragged off its usual slot on the timetable becomes a make-up, and
-- dragging it back to where it came from restores the ordinary lesson. That
-- "back to where it came from" needs somewhere to remember the original slot,
-- so it survives across moves. Both are null for a lesson sitting where it was
-- generated; they are set the first time it is moved and cleared when it lands
-- home again.
--
-- Only the base table needs these: v_sessions already carries session_type
-- (its `select s.*`), which is what the calendar reads to badge a make-up, and
-- the move logic reads the original slot from `sessions` directly.
alter table public.sessions
  add column if not exists original_starts_at timestamptz,
  add column if not exists original_ends_at   timestamptz;

comment on column public.sessions.original_starts_at is
  'The slot this lesson was generated in, remembered while it is moved so dragging it back can restore the original lesson. Null when it sits where it belongs.';
comment on column public.sessions.original_ends_at is
  'Companion to original_starts_at: the original end, so a returned lesson recovers its exact length.';
