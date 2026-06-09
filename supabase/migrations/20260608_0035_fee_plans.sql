-- Fee plan templates — Phase 1 of fees overhaul.
--
-- Today fee_status rows are entered one-per-student-per-period, which
-- doesn't scale to 4 campuses + ~7 classes each. This migration adds
-- the template layer:
--
--   class_fee_plan       — "Grade 3 monthly tuition, 8000 PKR"
--   student_fee_override — per-student exception (scholarship, sibling
--                          discount, parent waiver). Optional;
--                          students inherit the class plan amount by
--                          default.
--
-- Subsequent PRs will:
--   - Replace fee_status.amount_paid scalar with a fee_payment history
--   - Add a bulk "generate this period's fees" action that walks plans
--     × active students × overrides to upsert fee_status rows.
--
-- This migration only adds the template + override tables. It does
-- NOT touch fee_status — manual rows keep working unchanged.

CREATE TABLE IF NOT EXISTS public.class_fee_plan (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  class_id        uuid NOT NULL REFERENCES public.class(id) ON DELETE CASCADE,
  name            text NOT NULL,                    -- "Tuition", "Books", "Transport"
  amount          numeric(10,2) NOT NULL CHECK (amount >= 0),
  frequency       text NOT NULL DEFAULT 'monthly'
                    CHECK (frequency IN ('monthly','one_off')),
  -- For monthly plans, the day-of-month due (1..28 to stay safe for Feb).
  -- For one-off plans, the absolute date the fee is due (admin enters yyyy-mm-dd).
  default_due_day int CHECK (default_due_day IS NULL OR (default_due_day BETWEEN 1 AND 28)),
  one_off_due_date date,
  -- Soft archive — keeps historical generated fee_status rows referenceable.
  archived_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (frequency = 'monthly' AND one_off_due_date IS NULL)
    OR (frequency = 'one_off' AND default_due_day IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_class_fee_plan_class
  ON public.class_fee_plan(class_id) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.student_fee_override (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES public.student(id) ON DELETE CASCADE,
  class_fee_plan_id uuid NOT NULL REFERENCES public.class_fee_plan(id) ON DELETE CASCADE,
  -- Either an absolute override amount OR a "waived" flag. If both are
  -- null, the row is a no-op (the row's only purpose then would be the
  -- notes audit trail, which is fine).
  override_amount numeric(10,2) CHECK (override_amount IS NULL OR override_amount >= 0),
  waived          boolean NOT NULL DEFAULT false,
  notes           text,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, class_fee_plan_id)
);
CREATE INDEX IF NOT EXISTS idx_student_fee_override_student
  ON public.student_fee_override(student_id);
