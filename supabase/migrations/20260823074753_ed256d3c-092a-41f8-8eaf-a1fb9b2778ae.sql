-- 1. Keep the old demo tables under the proto_ names the reference screens expect.
ALTER TABLE public.students RENAME TO proto_students;
ALTER TABLE public.tutors RENAME TO proto_tutors;
ALTER TABLE public.sessions RENAME TO proto_sessions;
ALTER TABLE public.session_students RENAME TO proto_session_students;
ALTER TABLE public.packages RENAME TO proto_packages;
ALTER TABLE public.student_packages RENAME TO proto_student_packages;

-- 2. Vocabulary
CREATE TYPE public.staff_role AS ENUM ('owner','admin');
CREATE TYPE public.person_status AS ENUM ('active','inactive');
CREATE TYPE public.period_type AS ENUM ('standard_term','holiday_intensive','other');
CREATE TYPE public.period_status AS ENUM ('planned','active','closed');
CREATE TYPE public.pricing_basis AS ENUM ('per_hour','per_session','fixed_hours_price');
CREATE TYPE public.price_status AS ENUM ('active','inactive');
CREATE TYPE public.offering_type AS ENUM ('group_class','private_tuition');
CREATE TYPE public.offering_status AS ENUM ('planned','active','closed','cancelled');
CREATE TYPE public.recurrence_pattern AS ENUM ('weekly','fortnightly','daily','one_off','ad_hoc');
CREATE TYPE public.session_status AS ENUM ('scheduled','completed','cancelled','rescheduled');
CREATE TYPE public.session_type AS ENUM ('regular','dedicated_make_up');
CREATE TYPE public.enrolment_status AS ENUM ('trial','active','closed');
CREATE TYPE public.billing_method AS ENUM ('hours','payg');
CREATE TYPE public.adjustment_type AS ENUM ('none','percentage','fixed_amount','final_price_override');
CREATE TYPE public.closure_reason AS ENUM ('completed','withdrawn','transferred','other');
CREATE TYPE public.package_type AS ENUM ('purchased','courtesy');
CREATE TYPE public.package_status AS ENUM ('draft','active','closed','expired');
CREATE TYPE public.attendance_type AS ENUM ('regular','trial','make_up');
CREATE TYPE public.attendance_status AS ENUM ('not_marked','present','absent');
CREATE TYPE public.charge_source AS ENUM ('hours','payg');
CREATE TYPE public.charge_route AS ENUM ('parent','internal');
CREATE TYPE public.charge_status AS ENUM ('to_invoice','invoiced','paid','cancelled');
CREATE TYPE public.payment_method AS ENUM ('cash','bank_transfer','other');
CREATE TYPE public.payout_status AS ENUM ('draft','approved','paid');

CREATE SEQUENCE public.seq_guardian; CREATE SEQUENCE public.seq_student; CREATE SEQUENCE public.seq_tutor;
CREATE SEQUENCE public.seq_offering; CREATE SEQUENCE public.seq_session; CREATE SEQUENCE public.seq_enrolment;
CREATE SEQUENCE public.seq_package; CREATE SEQUENCE public.seq_attendance; CREATE SEQUENCE public.seq_charge;
CREATE SEQUENCE public.seq_payout;

-- 3. Access
CREATE TABLE public.staff (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  role public.staff_role NOT NULL DEFAULT 'admin',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.access_requests (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  note text,
  requested_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.staff s WHERE s.user_id = auth.uid() AND s.is_active);
$$;
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.staff s WHERE s.user_id = auth.uid() AND s.is_active AND s.role = 'owner');
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_first_owner(p_full_name text)
RETURNS public.staff LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.staff; v_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first.'; END IF;
  IF EXISTS (SELECT 1 FROM public.staff) THEN
    RAISE EXCEPTION 'This business already has staff. Ask an owner to invite you.';
  END IF;
  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = auth.uid();
  INSERT INTO public.staff (user_id, full_name, email, role, is_active)
  VALUES (auth.uid(), p_full_name, coalesce(v_email,''), 'owner', true)
  RETURNING * INTO v_row;
  DELETE FROM public.access_requests WHERE user_id = auth.uid();
  RETURN v_row;
END; $$;

-- 4. Setup catalogue
CREATE TABLE public.operating_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, code text NOT NULL UNIQUE,
  period_type public.period_type NOT NULL DEFAULT 'standard_term',
  starts_on date NOT NULL, ends_on date NOT NULL,
  status public.period_status NOT NULL DEFAULT 'planned',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.standard_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, code text NOT NULL UNIQUE,
  year_group text, scope text,
  basis public.pricing_basis NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_rate numeric NOT NULL DEFAULT 0,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  status public.price_status NOT NULL DEFAULT 'active',
  notes text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, code text NOT NULL UNIQUE,
  year_level text, subject text, exam_focus text,
  default_offering_type public.offering_type,
  standard_duration_hours numeric NOT NULL DEFAULT 1.5,
  default_price_id uuid REFERENCES public.standard_prices(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.tutors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE DEFAULT 'TUT-' || lpad(nextval('public.seq_tutor')::text, 4, '0'),
  full_name text NOT NULL, email text, mobile text,
  status public.person_status NOT NULL DEFAULT 'active',
  colour text, notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. People
CREATE TABLE public.guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE DEFAULT 'GDN-' || lpad(nextval('public.seq_guardian')::text, 4, '0'),
  full_name text NOT NULL, email text, mobile text,
  status public.person_status NOT NULL DEFAULT 'active',
  notes text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE DEFAULT 'STU-' || lpad(nextval('public.seq_student')::text, 4, '0'),
  full_name text NOT NULL,
  status public.person_status NOT NULL DEFAULT 'active',
  year_level text, current_school text, date_of_birth date, joined_on date,
  how_they_found_us text,
  default_payer_id uuid REFERENCES public.guardians(id),
  notes text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.student_guardians (
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  guardian_id uuid NOT NULL REFERENCES public.guardians(id) ON DELETE CASCADE,
  relationship text,
  PRIMARY KEY (student_id, guardian_id)
);

-- 6. Classes and lessons
CREATE TABLE public.class_offerings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE DEFAULT 'OFF-' || lpad(nextval('public.seq_offering')::text, 4, '0'),
  program_id uuid NOT NULL REFERENCES public.programs(id),
  operating_period_id uuid NOT NULL REFERENCES public.operating_periods(id),
  primary_tutor_id uuid REFERENCES public.tutors(id),
  offering_type public.offering_type NOT NULL DEFAULT 'group_class',
  capacity integer NOT NULL DEFAULT 1,
  starts_on date NOT NULL, ends_on date NOT NULL,
  recurrence public.recurrence_pattern NOT NULL DEFAULT 'weekly',
  recurrence_start timestamptz,
  session_duration_hours numeric NOT NULL DEFAULT 1.5,
  room text, price_override numeric,
  status public.offering_status NOT NULL DEFAULT 'planned',
  notes text, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT private_capacity_one CHECK (offering_type <> 'private_tuition' OR capacity = 1)
);
CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE DEFAULT 'SES-' || lpad(nextval('public.seq_session')::text, 5, '0'),
  class_offering_id uuid NOT NULL REFERENCES public.class_offerings(id) ON DELETE CASCADE,
  tutor_id uuid REFERENCES public.tutors(id),
  session_type public.session_type NOT NULL DEFAULT 'regular',
  status public.session_status NOT NULL DEFAULT 'scheduled',
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
  room text,
  replaces_session_id uuid REFERENCES public.sessions(id),
  notes text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sessions_unique_slot ON public.sessions (class_offering_id, starts_at);

-- 7. Enrolments, hours, roll
CREATE TABLE public.enrolments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE DEFAULT 'ENR-' || lpad(nextval('public.seq_enrolment')::text, 5, '0'),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_offering_id uuid NOT NULL REFERENCES public.class_offerings(id) ON DELETE CASCADE,
  status public.enrolment_status NOT NULL DEFAULT 'active',
  starts_on date NOT NULL DEFAULT CURRENT_DATE,
  ends_on date, closure public.closure_reason,
  method public.billing_method,
  standard_price_id uuid REFERENCES public.standard_prices(id),
  base_price numeric,
  adjustment public.adjustment_type NOT NULL DEFAULT 'none',
  adjustment_value numeric NOT NULL DEFAULT 0,
  hours_override numeric,
  default_package_id uuid,
  notes text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX enrolments_unique ON public.enrolments (student_id, class_offering_id, starts_on);

CREATE TABLE public.hours_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE DEFAULT 'PKG-' || lpad(nextval('public.seq_package')::text, 5, '0'),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  package_type public.package_type NOT NULL DEFAULT 'purchased',
  hours_purchased numeric NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  standard_price_id uuid REFERENCES public.standard_prices(id),
  approved_on date NOT NULL DEFAULT CURRENT_DATE,
  status public.package_status NOT NULL DEFAULT 'active',
  low_balance_threshold numeric NOT NULL DEFAULT 2,
  courtesy_reason text, admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT courtesy_needs_reason CHECK (package_type <> 'courtesy' OR courtesy_reason IS NOT NULL)
);
ALTER TABLE public.enrolments
  ADD CONSTRAINT enrolments_default_package_fkey
  FOREIGN KEY (default_package_id) REFERENCES public.hours_packages(id) ON DELETE SET NULL;

CREATE TABLE public.package_eligibility (
  package_id uuid NOT NULL REFERENCES public.hours_packages(id) ON DELETE CASCADE,
  enrolment_id uuid NOT NULL REFERENCES public.enrolments(id) ON DELETE CASCADE,
  PRIMARY KEY (package_id, enrolment_id)
);

CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE DEFAULT 'ATT-' || lpad(nextval('public.seq_attendance')::text, 6, '0'),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  enrolment_id uuid NOT NULL REFERENCES public.enrolments(id) ON DELETE CASCADE,
  att_type public.attendance_type NOT NULL DEFAULT 'regular',
  status public.attendance_status NOT NULL DEFAULT 'not_marked',
  package_id uuid REFERENCES public.hours_packages(id),
  source_attendance_id uuid REFERENCES public.attendance(id),
  correction_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX attendance_unique ON public.attendance (session_id, enrolment_id, att_type);

CREATE OR REPLACE FUNCTION public.check_attendance_package()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_student uuid; v_pkg_student uuid;
BEGIN
  IF NEW.package_id IS NULL THEN RETURN NEW; END IF;
  SELECT e.student_id INTO v_student FROM public.enrolments e WHERE e.id = NEW.enrolment_id;
  SELECT p.student_id INTO v_pkg_student FROM public.hours_packages p WHERE p.id = NEW.package_id;
  IF v_student IS DISTINCT FROM v_pkg_student THEN
    RAISE EXCEPTION 'That package belongs to a different student.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.package_eligibility pe
                 WHERE pe.package_id = NEW.package_id AND pe.enrolment_id = NEW.enrolment_id) THEN
    RAISE EXCEPTION 'That package is not eligible for this enrolment.';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER attendance_package_check BEFORE INSERT OR UPDATE ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.check_attendance_package();

-- 8. Money
CREATE TABLE public.charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE DEFAULT 'CHG-' || lpad(nextval('public.seq_charge')::text, 5, '0'),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  payer_id uuid REFERENCES public.guardians(id),
  source public.charge_source NOT NULL,
  package_id uuid REFERENCES public.hours_packages(id) ON DELETE CASCADE,
  attendance_id uuid REFERENCES public.attendance(id) ON DELETE CASCADE,
  standard_amount numeric NOT NULL DEFAULT 0,
  adjustment numeric NOT NULL DEFAULT 0,
  route public.charge_route NOT NULL DEFAULT 'parent',
  status public.charge_status NOT NULL DEFAULT 'to_invoice',
  invoice_date date, xero_invoice_no text,
  paid_date date, method public.payment_method, payment_ref text,
  notes text, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT charge_total_not_negative CHECK (standard_amount + adjustment >= 0),
  CONSTRAINT charge_parent_needs_payer CHECK (route <> 'parent' OR payer_id IS NOT NULL),
  CONSTRAINT charge_paid_needs_evidence CHECK (status <> 'paid' OR (paid_date IS NOT NULL AND method IS NOT NULL))
);
CREATE UNIQUE INDEX charges_one_per_attendance ON public.charges (attendance_id) WHERE attendance_id IS NOT NULL;
CREATE UNIQUE INDEX charges_one_per_package ON public.charges (package_id) WHERE package_id IS NOT NULL;

CREATE TABLE public.tutor_pay_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES public.tutors(id) ON DELETE CASCADE,
  hourly_rate numeric NOT NULL,
  effective_from date NOT NULL,
  note text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tutor_pay_rates_unique ON public.tutor_pay_rates (tutor_id, effective_from);

CREATE TABLE public.session_pay_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  note text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tutor_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE DEFAULT 'PAY-' || lpad(nextval('public.seq_payout')::text, 5, '0'),
  tutor_id uuid NOT NULL REFERENCES public.tutors(id) ON DELETE CASCADE,
  fortnight_start date NOT NULL,
  hours_worked numeric NOT NULL DEFAULT 0,
  rate_at_payout numeric NOT NULL DEFAULT 0,
  hours_adjustment numeric NOT NULL DEFAULT 0,
  amount_adjustment numeric NOT NULL DEFAULT 0,
  adjustment_reason text,
  status public.payout_status NOT NULL DEFAULT 'draft',
  paid_date date, method public.payment_method, payment_ref text,
  notes text, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payout_unique UNIQUE (tutor_id, fortnight_start),
  CONSTRAINT payout_paid_needs_evidence CHECK (status <> 'paid' OR (paid_date IS NOT NULL AND method IS NOT NULL))
);

-- 9. Derived reads. Sydney dates and fortnights are computed here, once.
CREATE OR REPLACE FUNCTION public.syd_date(ts timestamptz)
RETURNS date LANGUAGE sql IMMUTABLE AS $$ SELECT (ts AT TIME ZONE 'Australia/Sydney')::date $$;

CREATE OR REPLACE FUNCTION public.fortnight_start(d date)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT DATE '2024-01-01' + (floor((d - DATE '2024-01-01') / 14.0)::int * 14)
$$;

CREATE VIEW public.v_sessions WITH (security_invoker = true) AS
SELECT s.*,
  public.syd_date(s.starts_at) AS session_date,
  round(EXTRACT(EPOCH FROM (s.ends_at - s.starts_at)) / 3600.0, 2) AS duration_hours,
  CASE WHEN s.status = 'cancelled' THEN 0
       ELSE round(EXTRACT(EPOCH FROM (s.ends_at - s.starts_at)) / 3600.0, 2) END AS payable_hours,
  public.fortnight_start(public.syd_date(s.starts_at)) AS fortnight_start,
  public.fortnight_start(public.syd_date(s.starts_at)) + 13 AS fortnight_end,
  (public.syd_date(s.starts_at) = public.syd_date(now())) AS is_today,
  (public.fortnight_start(public.syd_date(s.starts_at)) = public.fortnight_start(public.syd_date(now()))) AS is_this_fortnight
FROM public.sessions s;

CREATE VIEW public.v_attendance WITH (security_invoker = true) AS
SELECT a.*,
  public.syd_date(s.starts_at) AS session_date,
  s.starts_at AS lesson_starts_at,
  s.class_offering_id,
  s.tutor_id AS lesson_tutor_id,
  e.student_id,
  e.method AS billing_method,
  CASE WHEN s.status = 'cancelled' THEN 'cancelled' ELSE a.status::text END AS effective_status,
  CASE
    WHEN s.status = 'cancelled' THEN 0
    WHEN a.status <> 'present' THEN 0
    WHEN a.att_type = 'trial' THEN 0
    WHEN e.method IS DISTINCT FROM 'hours' THEN 0
    ELSE round(EXTRACT(EPOCH FROM (s.ends_at - s.starts_at)) / 3600.0, 2)
  END AS hours_consumed,
  CASE
    WHEN a.status <> 'absent' THEN NULL
    WHEN EXISTS (SELECT 1 FROM public.attendance m
                 WHERE m.source_attendance_id = a.id AND m.status = 'present') THEN 'completed'
    WHEN EXISTS (SELECT 1 FROM public.attendance m WHERE m.source_attendance_id = a.id) THEN 'scheduled'
    ELSE 'outstanding'
  END AS make_up_state
FROM public.attendance a
JOIN public.sessions s ON s.id = a.session_id
JOIN public.enrolments e ON e.id = a.enrolment_id;

CREATE VIEW public.v_hours_packages WITH (security_invoker = true) AS
SELECT p.*,
  coalesce(u.hours_used, 0) AS hours_used,
  p.hours_purchased - coalesce(u.hours_used, 0) AS hours_remaining,
  (p.hours_purchased - coalesce(u.hours_used, 0)) <= p.low_balance_threshold AS is_low,
  (p.hours_purchased - coalesce(u.hours_used, 0)) < 0 AS is_overdrawn
FROM public.hours_packages p
LEFT JOIN (
  SELECT va.package_id, sum(va.hours_consumed) AS hours_used
  FROM public.v_attendance va WHERE va.package_id IS NOT NULL GROUP BY va.package_id
) u ON u.package_id = p.id;

CREATE VIEW public.v_enrolments WITH (security_invoker = true) AS
SELECT e.*,
  CASE
    WHEN e.base_price IS NULL THEN NULL
    WHEN e.adjustment = 'percentage' THEN round(e.base_price * (1 - e.adjustment_value / 100.0), 2)
    WHEN e.adjustment = 'fixed_amount' THEN round(e.base_price - e.adjustment_value, 2)
    WHEN e.adjustment = 'final_price_override' THEN round(e.adjustment_value, 2)
    ELSE round(e.base_price, 2)
  END AS final_agreed_price
FROM public.enrolments e;

CREATE VIEW public.v_charges WITH (security_invoker = true) AS
SELECT c.*, round(c.standard_amount + c.adjustment, 2) AS final_amount
FROM public.charges c;

CREATE VIEW public.v_session_pay WITH (security_invoker = true) AS
SELECT vs.id AS session_id, vs.code, vs.class_offering_id, vs.tutor_id, vs.session_date,
  vs.fortnight_start, vs.payable_hours,
  r.hourly_rate,
  round(vs.payable_hours * coalesce(r.hourly_rate, 0), 2) AS base_pay,
  coalesce(adj.amount, 0) AS adjustment,
  round(vs.payable_hours * coalesce(r.hourly_rate, 0) + coalesce(adj.amount, 0), 2) AS pay
FROM public.v_sessions vs
LEFT JOIN LATERAL (
  SELECT tr.hourly_rate FROM public.tutor_pay_rates tr
  WHERE tr.tutor_id = vs.tutor_id AND tr.effective_from <= vs.session_date
  ORDER BY tr.effective_from DESC LIMIT 1
) r ON true
LEFT JOIN (
  SELECT spa.session_id, sum(spa.amount) AS amount
  FROM public.session_pay_adjustments spa GROUP BY spa.session_id
) adj ON adj.session_id = vs.id
WHERE vs.status <> 'cancelled';

CREATE VIEW public.v_tutor_fortnight_pay WITH (security_invoker = true) AS
SELECT sp.tutor_id, t.full_name AS tutor_name, sp.fortnight_start, sp.fortnight_start + 13 AS fortnight_end,
  count(*)::int AS lessons,
  round(sum(sp.payable_hours), 2) AS hours,
  round(sum(sp.adjustment), 2) AS adjustments,
  round(sum(sp.pay), 2) AS total_pay
FROM public.v_session_pay sp
JOIN public.tutors t ON t.id = sp.tutor_id
GROUP BY sp.tutor_id, t.full_name, sp.fortnight_start;

CREATE VIEW public.v_needs_attention WITH (security_invoker = true) AS
SELECT 'attendance'::text AS entity, va.id, va.code, 'Roll not marked for a past lesson'::text AS issue
FROM public.v_attendance va
WHERE va.status = 'not_marked' AND va.session_date < public.syd_date(now())
UNION ALL
SELECT 'session', vs.id, vs.code, 'Lesson has no tutor assigned'
FROM public.v_sessions vs WHERE vs.tutor_id IS NULL AND vs.status = 'scheduled'
UNION ALL
SELECT 'hours_package', vp.id, vp.code, CASE WHEN vp.is_overdrawn THEN 'Hours overdrawn' ELSE 'Hours running low' END
FROM public.v_hours_packages vp WHERE vp.status = 'active' AND vp.is_low
UNION ALL
SELECT 'student', s.id, s.code, 'No default payer set'
FROM public.students s WHERE s.status = 'active' AND s.default_payer_id IS NULL
UNION ALL
SELECT 'enrolment', e.id, e.code, 'Paid enrolment with no billing method'
FROM public.enrolments e WHERE e.status = 'active' AND e.method IS NULL
UNION ALL
SELECT 'attendance', va.id, va.code, 'Absence with no make-up booked'
FROM public.v_attendance va WHERE va.make_up_state = 'outstanding';

-- 10. Jobs. Idempotent by construction.
CREATE OR REPLACE FUNCTION public.generate_sessions(p_offering_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.class_offerings; v_at timestamptz; v_step interval; v_created int := 0; v_ins int;
BEGIN
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
  FOR r IN SELECT id FROM public.sessions
           WHERE class_offering_id = p_offering_id AND status <> 'cancelled' LOOP
    v_total := v_total + public.seed_roll(r.id);
  END LOOP;
  RETURN v_total;
END; $$;

-- 11. Access rules: staff see the business, owners see pay.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['staff','access_requests','operating_periods','standard_prices','programs',
    'tutors','guardians','students','student_guardians','class_offerings','sessions','enrolments',
    'hours_packages','package_eligibility','attendance','charges','tutor_pay_rates',
    'session_pay_adjustments','tutor_payouts']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['operating_periods','standard_prices','programs','tutors','guardians',
    'students','student_guardians','class_offerings','sessions','enrolments','hours_packages',
    'package_eligibility','attendance','charges']
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff())',
      t || '_staff_all', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['tutor_pay_rates','session_pay_adjustments','tutor_payouts']
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner())',
      t || '_owner_all', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['v_sessions','v_attendance','v_hours_packages','v_enrolments','v_charges',
    'v_needs_attention','v_session_pay','v_tutor_fortnight_pay']
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO service_role', t);
  END LOOP;
END $$;

CREATE POLICY staff_read_self_or_staff ON public.staff FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff());
CREATE POLICY staff_owner_write ON public.staff FOR INSERT TO authenticated WITH CHECK (public.is_owner());
CREATE POLICY staff_owner_update ON public.staff FOR UPDATE TO authenticated
  USING (public.is_owner()) WITH CHECK (public.is_owner());
CREATE POLICY staff_owner_delete ON public.staff FOR DELETE TO authenticated USING (public.is_owner());

CREATE POLICY requests_read ON public.access_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_owner());
CREATE POLICY requests_insert_self ON public.access_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY requests_update_self ON public.access_requests FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY requests_owner_delete ON public.access_requests FOR DELETE TO authenticated
  USING (public.is_owner() OR user_id = auth.uid());