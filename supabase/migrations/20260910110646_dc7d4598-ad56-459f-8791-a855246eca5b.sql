-- A tutor needs the trial students sitting in on their own lessons: they are on
-- the roll in the room, but they are rows in `trials`, whose only policy used
-- is_staff() - narrowed to owner/admin - so a tutor read zero of them.
--
-- Read and update only. Creating a trial and deleting one belong to the office,
-- along with the lead behind it; a tutor records what happened and nothing else.

DROP POLICY IF EXISTS trials_tutor_read ON public.trials;
CREATE POLICY trials_tutor_read ON public.trials
  FOR SELECT TO authenticated
  USING (public.is_tutor() AND session_id IS NOT NULL AND public.teaches_session(session_id));

DROP POLICY IF EXISTS trials_tutor_mark ON public.trials;
CREATE POLICY trials_tutor_mark ON public.trials
  FOR UPDATE TO authenticated
  USING (public.is_tutor() AND session_id IS NOT NULL AND public.teaches_session(session_id))
  WITH CHECK (public.is_tutor() AND session_id IS NOT NULL AND public.teaches_session(session_id));

GRANT SELECT, UPDATE ON public.trials TO authenticated;
GRANT ALL ON public.trials TO service_role;

NOTIFY pgrst, 'reload schema';