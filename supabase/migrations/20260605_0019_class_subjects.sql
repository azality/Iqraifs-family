-- =============================================================================
-- School Pilot — Subjects move to class-level templates (Phase 1C).
--
-- Architectural fix: a subject (Math, Science, English) is a property of the
-- CLASS (Grade 3) — every section of Grade 3 teaches the same Math. What
-- differs per section is WHO teaches it (Zara teaches Math in 3-A, someone
-- else in 3-B). Phase 1A/1B put subjects at the section level, which would
-- have required adding "Math" three times for a 3-section grade — wrong.
--
-- New shape:
--   class_subject   — one row per (class, subject_name). The template.
--   section_subject — one row per (section, class_subject). Holds the
--                     teacher assignment for that specific section.
--
-- Idempotent. Safe to re-apply.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. class_subject — Subject templates per class (grade)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS class_subject (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  class_id        uuid NOT NULL REFERENCES class(id) ON DELETE CASCADE,
  name            text NOT NULL,
  sort_order      smallint NOT NULL DEFAULT 0,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz,
  UNIQUE (class_id, name)
);

CREATE INDEX IF NOT EXISTS class_subject_class
  ON class_subject(class_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS class_subject_org
  ON class_subject(org_id)   WHERE archived_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_class_subject_updated'
  ) THEN
    CREATE TRIGGER trg_class_subject_updated BEFORE UPDATE ON class_subject
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;

-- -----------------------------------------------------------------------------
-- 2. section_subject reshape — link to class_subject
-- -----------------------------------------------------------------------------
ALTER TABLE section_subject
  ADD COLUMN IF NOT EXISTS class_subject_id uuid REFERENCES class_subject(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS section_subject_class_subject
  ON section_subject(class_subject_id) WHERE archived_at IS NULL;

-- -----------------------------------------------------------------------------
-- 3. Backfill: for any pre-existing section_subject rows (added during 1A/1B
--    testing), promote their (class_id-via-section, name) to class_subject
--    and link them. No-op if no rows exist.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  cs_id uuid;
  derived_class_id uuid;
BEGIN
  FOR r IN
    SELECT ss.id, ss.org_id, ss.name, ss.sort_order, cs.class_id
    FROM section_subject ss
    JOIN class_section cs ON cs.id = ss.class_section_id
    WHERE ss.class_subject_id IS NULL
      AND ss.archived_at IS NULL
  LOOP
    derived_class_id := r.class_id;
    -- Upsert into class_subject (one per class+name)
    INSERT INTO class_subject (org_id, class_id, name, sort_order)
    VALUES (r.org_id, derived_class_id, r.name, r.sort_order)
    ON CONFLICT (class_id, name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO cs_id;
    UPDATE section_subject SET class_subject_id = cs_id WHERE id = r.id;
  END LOOP;
END$$;

-- -----------------------------------------------------------------------------
-- 4. After backfill, mark class_subject_id NOT NULL going forward.
-- We don't add the constraint yet to keep this migration safe if someone
-- left an orphaned soft-deleted row around; future cleanup migration
-- (0022) will tighten this once we're confident nothing legacy slips in.
-- -----------------------------------------------------------------------------
