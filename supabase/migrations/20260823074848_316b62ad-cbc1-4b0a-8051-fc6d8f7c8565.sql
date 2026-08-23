-- Pin search_path on the two helper functions.
ALTER FUNCTION public.syd_date(timestamptz) SET search_path = public;
ALTER FUNCTION public.fortnight_start(date) SET search_path = public;

-- Jobs and role checks must never be reachable without signing in.
REVOKE ALL ON FUNCTION public.is_staff() FROM anon, public;
REVOKE ALL ON FUNCTION public.is_owner() FROM anon, public;
REVOKE ALL ON FUNCTION public.bootstrap_first_owner(text) FROM anon, public;
REVOKE ALL ON FUNCTION public.generate_sessions(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.seed_roll(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.seed_roll_for_offering(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.check_attendance_package() FROM anon, public, authenticated;

GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_owner(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_sessions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_roll(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_roll_for_offering(uuid) TO authenticated;

-- The jobs run with elevated rights, so they check the caller themselves.
CREATE OR REPLACE FUNCTION public.generate_sessions(p_offering_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.class_offerings; v_at timestamptz; v_step interval; v_created int := 0; v_ins int;
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'Not allowed.'; END IF;
  SELECT * INTO o FROM public.class_offerings WHERE id = p_offering_id;
  IF o.id IS NULL THEN RAISE EXCEPTION 'That class no longer exists.'; END IF;
  IF o.recurrence_start IS NULL THEN
    RAISE EXCEPTION 'Set the first lesson date and time on the class before generating lessons.';
  END IF;
  v_step := CASE o.recurrence
    WHEN 'weekly' THEN interval '7 days'
    WHEN 'fortnightly' THEN interval '14 days'
    WHEN 'daily' THEN interval '1 day'
    ELSE NULL END;
  v_at := o.recurrence_start;
  LOOP
    EXIT WHEN public.syd_date(v_at) > o.ends_on;
    IF public.syd_date(v_at) >= o.starts_on THEN
      INSERT INTO public.sessions (class_offering_id, tutor_id, starts_at, ends_at, room)
      VALUES (o.id, o.primary_tutor_id, v_at,
              v_at + (o.session_duration_hours * interval '1 hour'), o.room)
      ON CONFLICT (class_offering_id, starts_at) DO NOTHING;
      GET DIAGNOSTICS v_ins = ROW_COUNT;
      v_created := v_created + v_ins;
    END IF;
    EXIT WHEN v_step IS NULL;
    v_at := v_at + v_step;
  END LOOP;
  RETURN v_created;
END; $$;

CREATE OR REPLACE FUNCTION public.seed_roll(p_session_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_created int := 0; v_ins int; s public.sessions; v_date date; e record;
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'Not allowed.'; END IF;
  SELECT * INTO s FROM public.sessions WHERE id = p_session_id;
  IF s.id IS NULL THEN RETURN 0; END IF;
  v_date := public.syd_date(s.starts_at);
  FOR e IN
    SELECT en.id, en.status FROM public.enrolments en
    WHERE en.class_offering_id = s.class_offering_id
      AND en.status <> 'closed'
      AND en.starts_on <= v_date
      AND (en.ends_on IS NULL OR en.ends_on >= v_date)
  LOOP
    INSERT INTO public.attendance (session_id, enrolment_id, att_type, status)
    VALUES (p_session_id, e.id,
            CASE WHEN e.status = 'trial' THEN 'trial'::public.attendance_type
                 ELSE 'regular'::public.attendance_type END,
            'not_marked')
    ON CONFLICT (session_id, enrolment_id, att_type) DO NOTHING;
    GET DIAGNOSTICS v_ins = ROW_COUNT;
    v_created := v_created + v_ins;
  END LOOP;
  RETURN v_created;
END; $$;

CREATE OR REPLACE FUNCTION public.seed_roll_for_offering(p_offering_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total int := 0; r record;
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'Not allowed.'; END IF;
  FOR r IN SELECT id FROM public.sessions
           WHERE class_offering_id = p_offering_id AND status <> 'cancelled' LOOP
    v_total := v_total + public.seed_roll(r.id);
  END LOOP;
  RETURN v_total;
END; $$;

REVOKE ALL ON FUNCTION public.generate_sessions(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.seed_roll(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.seed_roll_for_offering(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.generate_sessions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_roll(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_roll_for_offering(uuid) TO authenticated;