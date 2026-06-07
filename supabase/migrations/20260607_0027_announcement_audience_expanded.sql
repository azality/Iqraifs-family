-- =============================================================================
-- School Pilot — Expanded announcement audience targeting.
--
-- Phase F shipped 5 audience kinds: whole_school, class_section,
-- parents_only, students_only, specific_students.
--
-- This migration adds 5 more for the Iqra pilot:
--   - staff       — teachers + office + finance + admin + principal
--   - teachers    — class_teacher + visiting_teacher only
--   - class       — every section of a class (all students of Grade 3
--                   plus their parents + class/visiting teachers)
--   - program     — students filtered by program ('hifz' / 'conventional'),
--                   plus their parents + teachers of any section those
--                   students belong to
--   - subject     — students enrolled in a class_subject + their parents
--                   + the assigned subject teacher
--
-- The model stays single-row-per-announcement (audience_kind +
-- discriminator columns) instead of a M:N targeting table. The current
-- pilot scope doesn't need cross-bucket unions (e.g. "Teachers + Grade 3
-- parents"), and dropping that lets the recipient query stay O(1) per
-- announcement.
--
-- Idempotent.
-- =============================================================================

-- 1. Loosen the CHECK constraint on audience_kind to accept the five new
-- values. ADD CONSTRAINT requires dropping the old one first.
ALTER TABLE announcement DROP CONSTRAINT IF EXISTS announcement_audience_kind_check;

ALTER TABLE announcement
  ADD CONSTRAINT announcement_audience_kind_check
  CHECK (audience_kind IN (
    -- Original Phase F kinds — keep unchanged for backfill.
    'whole_school',
    'class_section',
    'parents_only',
    'students_only',
    'specific_students',
    -- Expanded set.
    'staff',
    'teachers',
    'class',
    'program',
    'subject'
  ));

-- 2. New discriminator columns. All nullable; the backend asserts that
-- exactly the right one is set for the chosen audience_kind. We don't
-- enforce that with a SQL CHECK because Postgres CHECKs across multiple
-- columns get ugly when the rules differ per kind — application-level
-- validation is clearer and easier to evolve.
ALTER TABLE announcement
  ADD COLUMN IF NOT EXISTS audience_class_id   uuid REFERENCES class(id)         ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS audience_subject_id uuid REFERENCES class_subject(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS audience_program    text;

-- 3. Student.program — feeds the 'program' audience kind, and is useful
-- on its own as a roster filter. Nullable so existing students don't
-- need backfill; the demo seed can default new students to a value, and
-- the import flow accepts a `program` column.
ALTER TABLE student
  ADD COLUMN IF NOT EXISTS program text;
-- Light CHECK so the enum doesn't drift via free-text. NULL still
-- allowed.
ALTER TABLE student DROP CONSTRAINT IF EXISTS student_program_check;
ALTER TABLE student
  ADD CONSTRAINT student_program_check
  CHECK (program IS NULL OR program IN ('hifz', 'conventional'));

-- Index helps the program-targeting recipient query.
CREATE INDEX IF NOT EXISTS student_program
  ON student(org_id, program)
  WHERE program IS NOT NULL;

-- Optional convenience indexes for the new audience columns. Cheap;
-- the announcement table will never grow large at pilot scale.
CREATE INDEX IF NOT EXISTS announcement_audience_class
  ON announcement(audience_class_id)
  WHERE audience_class_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS announcement_audience_subject
  ON announcement(audience_subject_id)
  WHERE audience_subject_id IS NOT NULL;
