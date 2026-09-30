-- Per-subject assessment mode (30 Sep 2026).
--
-- Art and Craft and Robotics are graded A+/A/B, not marked, and the
-- Final Assessment will grade Reception and Junior pass/fail. Until now
-- a subject either had marks papers or nothing, and a letter had nowhere
-- to live - the 3 Oct interim parked it in the subject's comment, which
-- the office rightly called a shortcut ("we would need this for the long
-- term... there will be other schools with these requirements").
--
-- assessment_mode says how a subject is assessed; grade_letter stores the
-- letter (or PASS/FAIL) as a first-class score value. max_marks stays
-- NOT NULL (>0): grade rows keep the placeholder max the no-marks
-- subjects already carry, with obtained_marks NULL so nothing ever
-- touches a total.
--
-- Idempotent: safe to re-run.

ALTER TABLE class_subject
  ADD COLUMN IF NOT EXISTS assessment_mode text NOT NULL DEFAULT 'marks';

ALTER TABLE class_subject
  DROP CONSTRAINT IF EXISTS class_subject_assessment_mode_check;
ALTER TABLE class_subject
  ADD CONSTRAINT class_subject_assessment_mode_check
  CHECK (assessment_mode IN ('marks', 'grade', 'pass_fail'));

COMMENT ON COLUMN class_subject.assessment_mode IS
  'How the subject is assessed: marks (papers with totals), grade (letter from the school''s grade scale), pass_fail (Final Assessment, Reception/Junior).';

ALTER TABLE exam_subject_score
  ADD COLUMN IF NOT EXISTS grade_letter text;

ALTER TABLE exam_subject_score
  DROP CONSTRAINT IF EXISTS exam_subject_score_grade_letter_check;
ALTER TABLE exam_subject_score
  ADD CONSTRAINT exam_subject_score_grade_letter_check
  CHECK (grade_letter IS NULL OR char_length(grade_letter) BETWEEN 1 AND 10);

COMMENT ON COLUMN exam_subject_score.grade_letter IS
  'The letter for a grade-mode subject (A+, B, PASS...). obtained_marks stays NULL on such rows; max_marks keeps its placeholder value.';
