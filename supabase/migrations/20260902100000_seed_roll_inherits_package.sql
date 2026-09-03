-- =============================================================================
-- Roll seeding: a new lesson's roll keeps drawing from the class's package.
--
-- seed_roll inserted attendance with (session_id, enrolment_id, att_type,
-- status) and nothing else, so every roll entry it created started with a NULL
-- package_id. Attaching a package to an enrolment re-points the roll that
-- exists at that moment - but any lesson created afterwards seeded a fresh,
-- unattributed row.
--
-- That is invisible until you look for it. The hours are taught and marked
-- present, v_attendance counts them as consumed, but v_hours_packages sums
-- usage `where package_id is not null` - so the balance is never drawn down,
-- the package reads as untouched, and nothing is billed.
--
-- It bites hardest on the commonest workflow there is: settling a make-up by
-- cancelling the original lesson and creating a new one in its place. The
-- cancelled lesson stops consuming (v_attendance zeroes a cancelled session),
-- the new lesson consumes instead - and the new lesson's roll points at
-- nothing.
--
-- The fix is for the roll to inherit the package the enrolment already draws
-- from, which is the same package the class was bought with.
--
-- Two guards, both of which mean this can never fail an insert:
--
--   * Eligibility. attendance carries a BEFORE INSERT trigger that refuses a
--     package with no package_eligibility row for the enrolment. So the package
--     is only used if that row already exists; otherwise NULL, exactly as
--     before. Seeding a roll must never be the thing that breaks.
--   * Trials. A trial never spends hours, so a trial row is always left
--     unattributed - the same rule setEnrolmentPackage follows.
--
-- Where the enrolment has no default_package_id but exactly one package is
-- eligible for it, that one is used: a single eligible package IS the package
-- for that class, and "which one?" has only one answer.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.seed_roll(p_session_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_created int := 0;
  v_ins int;
  s public.sessions;
  v_date date;
  e record;
  v_type public.attendance_type;
  v_package uuid;
  v_eligible int;
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION 'Not allowed.'; END IF;
  SELECT * INTO s FROM public.sessions WHERE id = p_session_id;
  IF s.id IS NULL THEN RETURN 0; END IF;
  v_date := public.syd_date(s.starts_at);

  FOR e IN
    SELECT en.id, en.status, en.default_package_id FROM public.enrolments en
    WHERE en.class_offering_id = s.class_offering_id
      AND en.status <> 'closed'
      AND en.starts_on <= v_date
      AND (en.ends_on IS NULL OR en.ends_on >= v_date)
  LOOP
    v_type := CASE WHEN e.status = 'trial' THEN 'trial'::public.attendance_type
                   ELSE 'regular'::public.attendance_type END;

    v_package := NULL;
    IF v_type <> 'trial' THEN
      -- The enrolment's own package, but only if it is actually eligible.
      SELECT pe.package_id INTO v_package
      FROM public.package_eligibility pe
      WHERE pe.enrolment_id = e.id
        AND pe.package_id = e.default_package_id;

      -- No default set, but exactly one package is eligible: that is the one.
      -- Two or more and there is a real choice to make, which is a person's to
      -- make, not this function's - so it stays NULL and the audit reports it.
      IF v_package IS NULL THEN
        SELECT count(*), min(pe.package_id) INTO v_eligible, v_package
        FROM public.package_eligibility pe
        WHERE pe.enrolment_id = e.id;
        IF v_eligible <> 1 THEN v_package := NULL; END IF;
      END IF;
    END IF;

    INSERT INTO public.attendance (session_id, enrolment_id, att_type, status, package_id)
    VALUES (p_session_id, e.id, v_type, 'not_marked', v_package)
    ON CONFLICT (session_id, enrolment_id, att_type) DO NOTHING;
    GET DIAGNOSTICS v_ins = ROW_COUNT;
    v_created := v_created + v_ins;
  END LOOP;

  RETURN v_created;
END; $$;

REVOKE ALL ON FUNCTION public.seed_roll(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.seed_roll(uuid) TO authenticated;
