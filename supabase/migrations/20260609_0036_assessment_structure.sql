-- Assessment structure — PR feat/assessment-foundation.
--
-- Today "grades" are assignment-based: gradebook averages whatever was
-- entered against assignments. That's good for daily work but doesn't
-- match how Iqra Academy (and most South-Asian schools) report:
-- per-TERM, per-EXAM, per-subject Max/Obtained → letter grade → printed
-- report card with teacher + principal comments.
--
-- This migration adds the three structural tables. A follow-up PR adds
-- the term_report_card table that pins comments + finalization on top
-- of these scores.
--
-- Subject reference: scores join to class_subject (existing). class_subject
-- already encodes which subjects exist per class. Per-section subject
-- templates are inherited from there too. The per-student score row is
-- therefore (exam_id, student_id, class_subject_id) which is enough
-- without re-anchoring on section.

CREATE TABLE IF NOT EXISTS public.academic_term (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Optional link to an academic year, when one exists. Terms within
  -- a year (Term 1, Term 2, Term 3) is the common case.
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  name            text NOT NULL,                     -- "Term 1", "First Term"
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  is_current      boolean NOT NULL DEFAULT false,
  archived_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  UNIQUE (org_id, name)
);
-- At most one current term per org (a partial UNIQUE index is the
-- idiomatic way — INSERT with is_current=true on a conflicting org fails).
CREATE UNIQUE INDEX IF NOT EXISTS academic_term_one_current_per_org
  ON public.academic_term (org_id)
  WHERE is_current AND archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.exam (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  term_id         uuid NOT NULL REFERENCES public.academic_term(id) ON DELETE CASCADE,
  name            text NOT NULL,                     -- "Mid-term", "Final"
  exam_type       text NOT NULL DEFAULT 'midterm'
                    CHECK (exam_type IN ('midterm','final','test','quiz','other')),
  -- For weighted composite term grade later. 1.0 = treat as a single
  -- exam; finals usually carry more weight. Phase 1 just stores; the
  -- aggregation pipeline will use it in Phase 2.
  weight          numeric(5,2) NOT NULL DEFAULT 1.0 CHECK (weight > 0),
  exam_date       date,
  archived_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (term_id, name)
);
CREATE INDEX IF NOT EXISTS idx_exam_term ON public.exam(term_id) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.exam_subject_score (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  exam_id         uuid NOT NULL REFERENCES public.exam(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES public.student(id) ON DELETE CASCADE,
  class_subject_id uuid NOT NULL REFERENCES public.class_subject(id) ON DELETE CASCADE,
  -- Max marks per (exam, subject) — kept at the score row level so a
  -- teacher can have different max marks per subject without forcing
  -- the same max across the whole exam. Common in PK schools (e.g.
  -- English 100, Islamiat 50).
  max_marks       numeric(6,2) NOT NULL CHECK (max_marks > 0),
  obtained_marks  numeric(6,2) CHECK (obtained_marks IS NULL OR obtained_marks >= 0),
  absent          boolean NOT NULL DEFAULT false,
  notes           text,
  recorded_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, student_id, class_subject_id),
  -- A score row is either present-with-marks or absent (then marks NULL).
  CHECK (
    (absent = true AND obtained_marks IS NULL)
    OR (absent = false)
  )
);
CREATE INDEX IF NOT EXISTS idx_score_exam_student
  ON public.exam_subject_score(exam_id, student_id);
CREATE INDEX IF NOT EXISTS idx_score_student
  ON public.exam_subject_score(student_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_exam_score_updated') THEN
    CREATE TRIGGER trg_exam_score_updated BEFORE UPDATE ON public.exam_subject_score
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;
