-- =============================================================================
-- Re-admission trace: student.readmitted_at / readmit_note
-- =============================================================================
-- Why:
--   Re-admission is two events wearing one button: an "undo" (left days
--   ago, same class) and a "returning student" (left in a past year -
--   old class is wrong, fee register changed). The dialog asks placement
--   questions; these columns keep the answer, and the left_at/left_reason
--   pair is now PRESERVED on re-admission so the record reads as a
--   timeline: admitted -> left (reason) -> re-admitted (note).
-- =============================================================================

ALTER TABLE student ADD COLUMN IF NOT EXISTS readmitted_at timestamptz;
ALTER TABLE student ADD COLUMN IF NOT EXISTS readmit_note text;
