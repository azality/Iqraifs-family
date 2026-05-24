-- =============================================================================
-- School Pilot — Phase A schema
-- =============================================================================
-- Adds the tables required for the Iqra Academy Phase A onboarding flow:
--   class, class_section, student, parent, student_parent, pin_credential,
--   link_code, role_template_override.
--
-- Scope:
--   - One Org, one Campus assumed (no campus table changes here — campuses
--     table exists from the initial migration and is left untouched).
--   - These tables sit alongside the earlier `classes` / `children` /
--     `family_members` model. Phase A introduces the school-side "student"
--     and "parent" records that are independent of the family-app records.
--     Bridging family<->school happens via `link_code`.
--
-- Idempotency:
--   - Every CREATE uses IF NOT EXISTS.
--   - The role_type enum extension uses ADD VALUE IF NOT EXISTS.
--   - Safe to re-run end-to-end with no side effects.
--
-- Security:
--   - No RLS policies are added — matches the existing pattern. All scope
--     checks happen in the edge function layer with the service role.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Extend role_type enum (existing enum from 0001 migration)
-- -----------------------------------------------------------------------------
-- The original enum is ('principal','teacher','parent','student'). Phase A
-- adds finer-grained school-side role types. ALTER TYPE ... ADD VALUE
-- IF NOT EXISTS is idempotent.
ALTER TYPE role_type ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE role_type ADD VALUE IF NOT EXISTS 'class_teacher';
ALTER TYPE role_type ADD VALUE IF NOT EXISTS 'visiting_teacher';


-- -----------------------------------------------------------------------------
-- 1. class — class/grade level (Phase A model, distinct from `classes`)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS class (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  display_order   int  NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);
CREATE INDEX IF NOT EXISTS class_org_order ON class(org_id, display_order);


-- -----------------------------------------------------------------------------
-- 2. class_section — A/B/C subdivisions of a class
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS class_section (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id                uuid NOT NULL REFERENCES class(id) ON DELETE CASCADE,
  name                    text NOT NULL,
  class_teacher_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, name)
);
CREATE INDEX IF NOT EXISTS class_section_teacher
  ON class_section(class_teacher_user_id)
  WHERE class_teacher_user_id IS NOT NULL;


-- -----------------------------------------------------------------------------
-- 3. student — school-side student record
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  class_section_id    uuid REFERENCES class_section(id) ON DELETE SET NULL,
  gr_number           text NOT NULL,
  full_name           text NOT NULL,
  photo_url           text,
  date_of_birth       date,
  gender              text,
  guardian_phone      text,
  guardian_email      text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, gr_number)
);
CREATE INDEX IF NOT EXISTS student_section ON student(class_section_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_student_updated'
  ) THEN
    CREATE TRIGGER trg_student_updated BEFORE UPDATE ON student
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;


-- -----------------------------------------------------------------------------
-- 4. parent — school-side parent record (separate from family-app users)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parent (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name       text NOT NULL,
  phone           text,
  email           text,
  relationship    text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS parent_org ON parent(org_id);


-- -----------------------------------------------------------------------------
-- 5. student_parent — many-to-many between students and parents
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_parent (
  student_id      uuid NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  parent_id       uuid NOT NULL REFERENCES parent(id)  ON DELETE CASCADE,
  is_primary      boolean NOT NULL DEFAULT false,
  PRIMARY KEY (student_id, parent_id)
);
CREATE INDEX IF NOT EXISTS student_parent_parent ON student_parent(parent_id);


-- -----------------------------------------------------------------------------
-- 6. pin_credential — GR# + 4-digit PIN auth for student/parent
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pin_credential (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subject_type        text NOT NULL CHECK (subject_type IN ('student','parent')),
  subject_id          uuid NOT NULL,
  login_identifier    text NOT NULL,
  pin_hash            text NOT NULL,
  must_change         boolean NOT NULL DEFAULT true,
  failed_attempts     int     NOT NULL DEFAULT 0,
  locked_until        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, login_identifier)
);
CREATE INDEX IF NOT EXISTS pin_credential_subject
  ON pin_credential(subject_type, subject_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pin_credential_updated'
  ) THEN
    CREATE TRIGGER trg_pin_credential_updated BEFORE UPDATE ON pin_credential
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;


-- -----------------------------------------------------------------------------
-- 7. link_code — parent enters this code in family app to bridge family<->school
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS link_code (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_id              uuid NOT NULL REFERENCES student(id)       ON DELETE CASCADE,
  code                    text NOT NULL,
  expires_at              timestamptz,
  consumed_at             timestamptz,
  consumed_by_user_id     uuid REFERENCES auth.users(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);
CREATE INDEX IF NOT EXISTS link_code_student ON link_code(student_id);
CREATE INDEX IF NOT EXISTS link_code_open
  ON link_code(org_id, code)
  WHERE consumed_at IS NULL;


-- -----------------------------------------------------------------------------
-- 8. role_template_override — school-level on/off toggles per role template
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS role_template_override (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role_template       text NOT NULL CHECK (role_template IN ('admin','class_teacher','visiting_teacher')),
  permission_key      text NOT NULL,
  allowed             boolean NOT NULL,
  updated_by          uuid REFERENCES auth.users(id),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, role_template, permission_key)
);


-- =============================================================================
-- End of Phase A schema.
-- =============================================================================
