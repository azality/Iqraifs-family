-- =============================================================================
-- School Pilot — Subjects per class section (Phase 1A of per-subject rewiring).
--
-- The original `subjects` table (Part 3) references the legacy `classes` table
-- and is never read by current UI. The new model lives in the Phase A world:
-- a `section_subject` row attaches a subject (Math, Science, English, Quran,
-- Urdu, …) to a specific `class_section` with an optional subject teacher.
--
-- Future migrations will:
--   - 0019: add subject_id to lesson
--   - 0020: add subject_id to assignment + gradebook
--   - 0022: deprecate the legacy `subjects` table
--
-- We also widen `user_roles` so a subject teacher's grant is scoped at the
-- subject level — narrower than class_section, so a visiting teacher who
-- teaches Math in 3-A doesn't accidentally see Science gradebook entries.
--
-- Idempotent. Service-role + app-level scope checks (no RLS).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. section_subject — Subjects taught in a class section
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS section_subject (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  class_section_id        uuid NOT NULL REFERENCES class_section(id) ON DELETE CASCADE,
  name                    text NOT NULL,
  teacher_user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sort_order              smallint NOT NULL DEFAULT 0,
  created_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  archived_at             timestamptz,
  UNIQUE (class_section_id, name)
);

CREATE INDEX IF NOT EXISTS section_subject_section
  ON section_subject(class_section_id)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS section_subject_teacher
  ON section_subject(teacher_user_id)
  WHERE teacher_user_id IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS section_subject_org
  ON section_subject(org_id)
  WHERE archived_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_section_subject_updated'
  ) THEN
    CREATE TRIGGER trg_section_subject_updated BEFORE UPDATE ON section_subject
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;

-- -----------------------------------------------------------------------------
-- 2. user_roles.subject_id — subject-level grant for visiting teachers
--
-- When a visiting teacher is assigned to teach Math in 3-A, we want their
-- read/write capability limited to that specific subject row, not the whole
-- section. Old rows leave subject_id NULL → "all subjects in this scope",
-- which matches existing class_teacher and admin semantics.
-- -----------------------------------------------------------------------------
ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES section_subject(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS user_roles_subject
  ON user_roles(subject_id)
  WHERE subject_id IS NOT NULL AND revoked_at IS NULL;
