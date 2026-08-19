-- =============================================================================
-- student.left_at / left_reason — soft "student left the school".
-- =============================================================================
-- Why:
--   Pilot feedback (Iqra IFS): the only options on a student were edit and
--   hard delete. A student who leaves must keep their record (attendance,
--   fees, audit) but drop out of rosters and billing.
--
-- Semantics:
--   Mark-left sets status='left', stamps left_at/left_reason, and clears
--   class_section_id + hifz_group_id — every roster, attendance and
--   billing query keys off the section, so the student disappears from
--   day-to-day surfaces automatically while the row (and history) stays.
--   Re-admitting reverses it: status='active', section reassigned.
-- =============================================================================

ALTER TABLE student ADD COLUMN IF NOT EXISTS left_at timestamptz;
ALTER TABLE student ADD COLUMN IF NOT EXISTS left_reason text;
ALTER TABLE student ADD COLUMN IF NOT EXISTS left_from_section_id uuid REFERENCES class_section(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_student_status ON student(org_id, status);
