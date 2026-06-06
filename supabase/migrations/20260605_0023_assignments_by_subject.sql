-- =============================================================================
-- School Pilot — Assignments + gradebook threaded by subject. Phase 3.
--
-- Same pattern as Phase 2 on the lesson table: add nullable FKs so the
-- teacher / admin can tag each assignment with which subject + (optional)
-- which curriculum topic it covers. Gradebook becomes per-subject queryable.
--
--   assignment.section_subject_id  → which subject in the section
--   assignment.curriculum_topic_id → which syllabus topic (optional)
--
-- Both nullable for backward compat with the row created before Phase 1C/2/3.
--
-- Idempotent.
-- =============================================================================

ALTER TABLE assignment
  ADD COLUMN IF NOT EXISTS section_subject_id  uuid REFERENCES section_subject(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS curriculum_topic_id uuid REFERENCES curriculum_topic(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS assignment_section_subject
  ON assignment(section_subject_id, due_date DESC)
  WHERE section_subject_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS assignment_curriculum_topic
  ON assignment(curriculum_topic_id)
  WHERE curriculum_topic_id IS NOT NULL;
