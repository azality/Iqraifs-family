-- Per-class schedule overrides (24 Sep 2026).
--
-- The term's marks_deadline_at / results_publish_at are the WHOLE
-- SCHOOL's clock. But the school publishes primary's results one day,
-- secondary's another, and Hifz has its own - and a class can be
-- exempted from the deadline altogether ("if they want to omit they
-- should be able to do so").
--
-- One optional row per (term, class):
--   marks_deadline_off  - true exempts the class from ANY deadline.
--   marks_deadline_at   - the class's own deadline (null = follow the
--                         school's, unless _off).
--   results_publish_at  - the class's own results day (null = follow
--                         the school's).
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS term_class_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  term_id uuid NOT NULL REFERENCES academic_term(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES class(id) ON DELETE CASCADE,
  marks_deadline_at timestamptz,
  marks_deadline_off boolean NOT NULL DEFAULT false,
  results_publish_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (term_id, class_id)
);
CREATE INDEX IF NOT EXISTS idx_term_class_schedule_term
  ON term_class_schedule(term_id);
ALTER TABLE term_class_schedule ENABLE ROW LEVEL SECURITY;
