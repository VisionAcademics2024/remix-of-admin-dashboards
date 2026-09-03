ALTER TYPE public.staff_role ADD VALUE IF NOT EXISTS 'tutor';

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS tutor_id uuid REFERENCES public.tutors(id) ON DELETE RESTRICT;

ALTER TABLE public.staff
  ADD CONSTRAINT staff_tutor_requires_tutor_id
  CHECK (role::text <> 'tutor' OR tutor_id IS NOT NULL);