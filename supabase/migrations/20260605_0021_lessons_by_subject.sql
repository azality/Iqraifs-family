-- =============================================================================
-- School Pilot — Lessons threaded by subject + curriculum topic. Phase 2.
--
-- Lesson today: { section, date, title, body, … }. The teacher logs "today's
-- lesson" against a section, but there's no way to say WHICH subject it
-- belongs to (Math vs Science vs Quran) or WHICH topic from the syllabus she
-- covered. This migration adds two nullable FKs:
--
--   lesson.section_subject_id  → which subject in which section
--   lesson.curriculum_topic_id → which topic from the syllabus
--
-- Both nullable for backward compatibility with existing rows (they fall
-- back to a "General" display in the UI). New lessons will be required to
-- pick a subject in the form; topic remains optional.
--
-- Idempotent.
-- =============================================================================

ALTER TABLE lesson
  ADD COLUMN IF NOT EXISTS section_subject_id  uuid REFERENCES section_subject(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS curriculum_topic_id uuid REFERENCES curriculum_topic(id) ON DELETE SET NULL;

-- Filter / list usage: feed by section + subject, sorted by date desc.
CREATE INDEX IF NOT EXISTS lesson_section_subject_date
  ON lesson(section_subject_id, lesson_date DESC)
  WHERE section_subject_id IS NOT NULL;

-- Curriculum-progress queries: "how many lessons covered topic X?"
CREATE INDEX IF NOT EXISTS lesson_curriculum_topic
  ON lesson(curriculum_topic_id)
  WHERE curriculum_topic_id IS NOT NULL;
