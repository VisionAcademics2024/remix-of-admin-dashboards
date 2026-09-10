-- =============================================================================
-- NO LONGER REQUIRED.
--
-- The app called this function to let a tutor write a lesson note, and until
-- this migration was applied every tutor pressing Save got "Could not find the
-- function public.set_session_notes in the schema cache" - a database error in
-- front of someone who cannot apply a database migration.
--
-- saveSessionNotes now asks the same question in application code
-- (mayWriteSessionNotes, with tests) and writes the one column with the service
-- role, so nothing calls this. It is left here rather than deleted because it is
-- CREATE OR REPLACE and harmless where it has already been applied; it can be
-- dropped whenever the schema is next tidied.
-- =============================================================================

-- =============================================================================
-- Let a tutor write up their own lesson.
--
-- The tutor access migration gave a tutor SELECT on sessions and no UPDATE, so
-- the notes box on a lesson was readable and unsavable: the write passed the
-- API, matched no rows under RLS, and reported success having changed nothing.
--
-- Notes are the one thing on a session a tutor genuinely owns - what happened
-- in the room, who was struggling, what to pick up next week. Everything else
-- on that row (the time, the tutor, the room, the status) is a scheduling
-- decision and stays with the office.
--
-- RLS cannot grant "update this column and no other", so this is a SECURITY
-- DEFINER function instead: one column, one lesson, and the same two questions
-- the rest of the schema asks - is_staff() for owners and admins, and
-- teaches_session() for the tutor actually standing in the room.
--
-- p_notes is trimmed, and an empty box clears the field rather than storing an
-- empty string, which is what updateSession already does for the same column.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_session_notes(p_session_id uuid, p_notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_staff() OR (public.is_tutor() AND public.teaches_session(p_session_id))) THEN
    RAISE EXCEPTION 'Not allowed to write notes on this lesson.';
  END IF;

  UPDATE public.sessions
     SET notes = nullif(btrim(coalesce(p_notes, '')), '')
   WHERE id = p_session_id;
END $$;

REVOKE ALL ON FUNCTION public.set_session_notes(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_session_notes(uuid, text) TO authenticated;
