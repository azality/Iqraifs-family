-- Term report card — PR feat/report-card-v2.
--
-- One row per (student, term). Holds the soft "envelope" around the
-- aggregated marks: comments + finalize/publish workflow. The marks
-- themselves are NOT denormalised here — the report-card endpoint
-- aggregates exam_subject_score on read so editing a score upstream
-- is reflected immediately (until publish locks it visually).
--
-- subject_comments is JSONB keyed by class_subject_id rather than a
-- separate table — a report card has 5–10 subjects max, and the comment
-- is always loaded with the card. A separate table would force a join
-- on every read without query savings. We can normalise later if a
-- per-subject audit trail becomes important.
--
-- finalized_at = "principal signed off, no more edits expected"
-- published_at = "parent can see this"
-- Two flags rather than one because most schools want a stage where
-- the report is done but not yet released (e.g. waiting for the term
-- meeting to hand it out).
--
-- Grade scale: this PR uses a hardcoded letter scale (A+/A/B/C/D/F at
-- 90/80/70/60/50). PR 3 will add a configurable grade_scale table.

CREATE TABLE IF NOT EXISTS public.term_report_card (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  student_id               uuid NOT NULL REFERENCES public.student(id) ON DELETE CASCADE,
  term_id                  uuid NOT NULL REFERENCES public.academic_term(id) ON DELETE CASCADE,
  principal_comment        text,
  class_teacher_comment    text,
  -- { "<class_subject_id>": "comment text", ... }
  subject_comments         jsonb NOT NULL DEFAULT '{}'::jsonb,
  finalized_at             timestamptz,
  finalized_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at             timestamptz,
  published_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, term_id)
);
CREATE INDEX IF NOT EXISTS idx_term_report_card_term
  ON public.term_report_card(term_id);
CREATE INDEX IF NOT EXISTS idx_term_report_card_published
  ON public.term_report_card(student_id) WHERE published_at IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_term_report_card_updated') THEN
    CREATE TRIGGER trg_term_report_card_updated BEFORE UPDATE ON public.term_report_card
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;
