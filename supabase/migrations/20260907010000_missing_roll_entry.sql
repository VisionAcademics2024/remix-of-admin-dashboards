-- =============================================================================
-- "This lesson has no roll entry for this student."
--
-- A student's place in a class is two records, not one: the enrolment says they
-- belong to it, and a roll entry per lesson says they are expected at each
-- particular one. seed_roll keeps the two in step - but only forwards, and only
-- when it is run. Take a roll entry away by hand (which the Sessions screen now
-- allows) and the enrolment still claims the student is in the class while the
-- lesson has no record of them. They vanish from that roll, no hours are drawn,
-- nothing is billed, and no screen says a word.
--
-- So the gap gets a name. One row per enrolment rather than one per missing
-- lesson: the count is what tells you whether this is a deliberate removal or a
-- roll that was never seeded, and a hundred rows for one term would drown the
-- badge that carries this to the nav.
--
-- What is deliberately NOT a gap:
--   * a cancelled or rescheduled lesson, which nobody sits and which needs no
--     roll;
--   * a dedicated make-up, which exists for the one student it was booked for.
--     Every other student in the class is not expected at it, and counting them
--     absent from it would make one make-up look like a whole class of gaps;
--   * a lesson outside the enrolment's own dates. That is the mechanism for
--     "they stopped coming in week 4": set ends_on, and the lessons after it
--     stop being missing rather than nagging forever. An enrolment with no
--     ends_on is claiming they attend to the end of the class, and is read
--     that way.
--
-- The rest of the view is unchanged and repeated only because a view has to be
-- replaced whole.
-- =============================================================================

CREATE OR REPLACE VIEW public.v_needs_attention
WITH (security_invoker = true) AS
  select 'session'::text as entity, s.id, s.code, 'Lesson has no tutor'::text as issue
  from sessions s where s.tutor_id is null and s.status = 'scheduled'
union all
  select 'attendance', a.id, a.code, 'Present on an hours enrolment with no package linked'
  from v_attendance a
  where a.status = 'present' and a.att_type <> 'trial'
    and a.billing_method = 'hours' and a.package_id is null
union all
  select 'attendance', a.id, a.code, 'Lesson has passed but the roll is not marked'
  from v_attendance a
  where a.status = 'not_marked' and a.session_date < syd_date(now())
union all
  select 'student', st.id, st.code, 'No default payer set'
  from students st where st.default_payer_id is null and st.status = 'active'
union all
  select 'enrolment', e.id, e.code, 'Hours enrolment with no default package'
  from enrolments e
  where e.method = 'hours' and e.status = 'active' and e.default_package_id is null
union all
  select 'enrolment', e.id, e.code, 'No agreed price recorded'
  from enrolments e where e.status <> 'trial' and e.base_price is null
union all
  -- The new one: enrolled in the class, missing from its lessons.
  select 'enrolment', e.id, e.code,
         'This session is missing: no roll entry for this student on ' ||
         count(*) || ' lesson' || case when count(*) = 1 then '' else 's' end ||
         ' in this class (earliest ' ||
         to_char(min(vs.session_date), 'DD Mon YYYY') || ')'
  from enrolments e
  join v_sessions vs on vs.class_offering_id = e.class_offering_id
  where e.status = 'active'
    and vs.status not in ('cancelled', 'rescheduled')
    and vs.session_type <> 'dedicated_make_up'
    and vs.session_date >= e.starts_on
    and (e.ends_on is null or vs.session_date <= e.ends_on)
    and not exists (
      select 1 from attendance a
      where a.enrolment_id = e.id and a.session_id = vs.id
    )
  group by e.id, e.code
union all
  select 'hours_package', p.id, p.code, 'Balance at or below the low threshold'
  from v_hours_packages p where p.status = 'active' and p.is_low
union all
  select 'hours_package', p.id, p.code, 'Overdrawn'
  from v_hours_packages p where p.is_overdrawn
union all
  select 'attendance', a.id, a.code, 'PAYG lesson attended but not charged'
  from v_attendance a
  where a.billing_method = 'payg' and a.status = 'present'
    and not exists (select 1 from charges c where c.attendance_id = a.id);

GRANT SELECT ON public.v_needs_attention TO authenticated;
