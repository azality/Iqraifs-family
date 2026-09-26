-- Remarks deadline (27 Sep 2026).
--
-- Class teachers can now reach their own class's report cards and write
-- the class-teacher remark. Two things had to follow (Muneeb, 27 Sep):
--
--   "when they finalized their remarks are also locked"
--   "there should still be a cutoff time because the office needs to
--    finalize ... if they enter the remarks last min the office won't
--    have time to get those printed"
--
-- Finalizing locks a remark on its own — no column needed, the card's
-- finalized_at already says it. This adds the second lock: a moment
-- after which a class teacher can no longer write a remark at all,
-- leaving the office a quiet window to finalize and print.
--
-- It is deliberately NOT the marks deadline. Remarks are written AFTER
-- the marks are in, and IFS's own 1st Assessment marks deadline had
-- already passed (24 Sep) before teachers were given cards at all —
-- sharing it would have locked them out of the term that matters.
--
-- Null = no cutoff; finalizing is then the only lock. A class exempted
-- from the marks deadline (term_class_schedule.marks_deadline_off, set
-- for Hifz I-IV / Junior / Reception) is exempt from this one too, so
-- the school keeps one list of exempt classes rather than two.

ALTER TABLE academic_term
  ADD COLUMN IF NOT EXISTS remarks_deadline_at timestamptz;

COMMENT ON COLUMN academic_term.remarks_deadline_at IS
  'Class teachers can no longer write report-card remarks after this moment. Null = no cutoff. The office is never locked.';

NOTIFY pgrst, 'reload schema';
