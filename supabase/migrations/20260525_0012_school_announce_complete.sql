-- =============================================================================
-- School Pilot — Phase F schema
-- Announcements (school-wide / section / specific) + Lesson completion tracking
--
-- Idempotent. No RLS. Service-role + app-level scope checks only.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. announcement
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcement (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  author_user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  audience_kind         text NOT NULL
                          CHECK (audience_kind IN (
                            'whole_school',
                            'class_section',
                            'parents_only',
                            'students_only',
                            'specific_students'
                          )),
  audience_section_id   uuid REFERENCES class_section(id) ON DELETE CASCADE,
  audience_student_ids  uuid[],
  title                 text NOT NULL,
  body                  text NOT NULL,
  attachments           jsonb NOT NULL DEFAULT '[]'::jsonb,
  published_at          timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS announcement_org_published
  ON announcement(org_id, published_at DESC);


-- -----------------------------------------------------------------------------
-- 2. lesson_completion
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lesson_completion (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lesson_id       uuid NOT NULL REFERENCES lesson(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  completed_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, student_id)
);
CREATE INDEX IF NOT EXISTS lesson_completion_student_completed
  ON lesson_completion(student_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS lesson_completion_lesson
  ON lesson_completion(lesson_id);


-- =============================================================================
-- End of Phase F schema.
-- =============================================================================
