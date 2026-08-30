ALTER TABLE public.sessions
  ADD COLUMN google_calendar_id text NULL,
  ADD COLUMN google_event_id text NULL,
  ADD COLUMN calendar_sync_status text NOT NULL DEFAULT 'not_synced',
  ADD COLUMN calendar_last_synced_at timestamptz NULL;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_calendar_sync_status_check
  CHECK (calendar_sync_status IN ('not_synced', 'pending', 'synced', 'failed'));

CREATE UNIQUE INDEX sessions_google_event_unique
  ON public.sessions (google_calendar_id, google_event_id)
  WHERE google_calendar_id IS NOT NULL AND google_event_id IS NOT NULL;