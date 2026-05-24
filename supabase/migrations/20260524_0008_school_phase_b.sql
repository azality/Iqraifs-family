-- =============================================================================
-- School Pilot — Phase B schema (daily ops)
-- =============================================================================
-- Adds the tables required for Phase B teacher/admin daily operations:
--   attendance, behavior_note, roster_change_request.
--
-- Scope:
--   - Builds on Phase A tables (student, class_section). One Org / one Campus
--     assumption holds for the pilot.
--   - These tables are independent of the legacy family-app `attendance` and
--     event tables; school-side daily ops live entirely here.
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
-- 1. attendance — one row per student per day per section
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id)  ON DELETE CASCADE,
  student_id          uuid NOT NULL REFERENCES student(id)        ON DELETE CASCADE,
  class_section_id    uuid NOT NULL REFERENCES class_section(id)  ON DELETE CASCADE,
  attendance_date     date NOT NULL,
  status              text NOT NULL CHECK (status IN ('present','absent','late','excused')),
  notes               text,
  recorded_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, attendance_date)
);
CREATE INDEX IF NOT EXISTS attendance_section_date
  ON attendance(class_section_id, attendance_date);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_attendance_updated'
  ) THEN
    CREATE TRIGGER trg_attendance_updated BEFORE UPDATE ON attendance
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;


-- -----------------------------------------------------------------------------
-- 2. behavior_note — teacher logs a positive observation or concern
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS behavior_note (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id)  ON DELETE CASCADE,
  student_id          uuid NOT NULL REFERENCES student(id)        ON DELETE CASCADE,
  class_section_id    uuid REFERENCES class_section(id)           ON DELETE SET NULL,
  kind                text NOT NULL CHECK (kind IN ('positive','concern')),
  category            text,
  points              int  NOT NULL DEFAULT 0,
  notes               text NOT NULL,
  observed_at         timestamptz NOT NULL DEFAULT now(),
  recorded_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS behavior_note_student_observed
  ON behavior_note(student_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS behavior_note_section_observed
  ON behavior_note(class_section_id, observed_at DESC);


-- -----------------------------------------------------------------------------
-- 3. roster_change_request — teacher proposes adding/removing a student
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roster_change_request (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES organizations(id)  ON DELETE CASCADE,
  class_section_id        uuid NOT NULL REFERENCES class_section(id)  ON DELETE CASCADE,
  kind                    text NOT NULL CHECK (kind IN ('add','remove')),
  student_id              uuid REFERENCES student(id) ON DELETE SET NULL,
  new_student_payload     jsonb,
  reason                  text,
  status                  text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','approved','rejected')),
  requested_by            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewed_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at             timestamptz,
  reviewer_notes          text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'remove' AND student_id IS NOT NULL)
    OR kind = 'add'
  )
);
CREATE INDEX IF NOT EXISTS roster_change_request_org_status
  ON roster_change_request(org_id, status);
CREATE INDEX IF NOT EXISTS roster_change_request_section
  ON roster_change_request(class_section_id, status);


-- =============================================================================
-- End of Phase B schema.
-- =============================================================================
