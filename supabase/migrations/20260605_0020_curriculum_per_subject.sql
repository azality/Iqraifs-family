-- =============================================================================
-- School Pilot — Curriculum moves to (class_subject, academic_year). Phase 1D.
--
-- Architectural correction: curriculum should belong to a class_subject
-- (Math for Grade 3 has ONE syllabus that applies to every section of Grade 3),
-- not to a class_section. The original schema put curriculum at the section
-- level, which would force the admin to redefine the Math syllabus for 3-A
-- and 3-B independently — same bug as old subjects.
--
-- Approach: add class_subject_id to curriculum (nullable for backward
-- compatibility with the legacy per-section curricula). New code reads/writes
-- via class_subject_id; old per-section curricula remain queryable through
-- the existing /sections/:sectionId/curriculum routes until cleanup.
--
-- Idempotent.
-- =============================================================================

ALTER TABLE curriculum
  ADD COLUMN IF NOT EXISTS class_subject_id uuid REFERENCES class_subject(id) ON DELETE CASCADE;

-- New uniqueness: (class_subject_id, academic_year) when set — one
-- curriculum per (subject, year). Old (class_section_id, academic_year)
-- unique constraint stays in place so legacy rows remain valid.
CREATE UNIQUE INDEX IF NOT EXISTS curriculum_subject_year
  ON curriculum(class_subject_id, academic_year)
  WHERE class_subject_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS curriculum_subject
  ON curriculum(class_subject_id)
  WHERE class_subject_id IS NOT NULL;
