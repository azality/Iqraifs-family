-- =============================================================================
-- School Pilot — Phase C.2 schema (assignments + grades)
-- =============================================================================
-- Adds the tables required for Phase C.2 academics:
--   assignment, grade.
--
-- Scope:
--   - Builds on Phase A (organizations, class_section, student) and prior
--     phases. One Org / one Campus assumption holds for the pilot.
--
-- Idempotency:
--   - Every CREATE uses IF NOT EXISTS.
--   - Triggers are wrapped in DO blocks that check pg_trigger first.
--   - Safe to re-run end-to-end with no side effects.
--
-- Security:
--   - No RLS policies are added — matches the existing pattern. All scope
--     checks happen in the edge function layer with the service role.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. assignment — graded item (quiz / test / homework / project / etc.)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assignment (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id)  ON DELETE CASCADE,
  class_section_id    uuid NOT NULL REFERENCES class_section(id)  ON DELETE CASCADE,
  title               text NOT NULL,
  kind                text NOT NULL CHECK (kind IN ('quiz','test','homework','project','class_participation','other')),
  description         text,
  max_score           numeric(8,2) NOT NULL CHECK (max_score > 0),
  weight              numeric(5,2) NOT NULL DEFAULT 1.0,
  due_date            date,
  assigned_date       date NOT NULL DEFAULT CURRENT_DATE,
  related_topic       text,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assignment_section_due
  ON assignment(class_section_id, due_date DESC);
CREATE INDEX IF NOT EXISTS assignment_org_assigned
  ON assignment(org_id, assigned_date DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_assignment_updated'
  ) THEN
    CREATE TRIGGER trg_assignment_updated BEFORE UPDATE ON assignment
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;


-- -----------------------------------------------------------------------------
-- 2. grade — individual student score on an assignment
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grade (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id)  ON DELETE CASCADE,
  assignment_id       uuid NOT NULL REFERENCES assignment(id)     ON DELETE CASCADE,
  student_id          uuid NOT NULL REFERENCES student(id)        ON DELETE CASCADE,
  score               numeric(8,2),
  status              text NOT NULL DEFAULT 'graded'
                        CHECK (status IN ('graded','missing','excused','late')),
  feedback            text,
  graded_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  graded_at           timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_id),
  CHECK (score IS NULL OR score >= 0)
);
CREATE INDEX IF NOT EXISTS grade_student_graded_at
  ON grade(student_id, graded_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_grade_updated'
  ) THEN
    CREATE TRIGGER trg_grade_updated BEFORE UPDATE ON grade
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;


-- =============================================================================
-- End of Phase C.2 schema.
-- =============================================================================
