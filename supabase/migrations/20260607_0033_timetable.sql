-- =============================================================================
-- School Pilot — Timetable foundation.
--
-- Two tables, one shape:
--
-- 1. timetable_slot — org-wide recurring time slot. Defines what
--    "Monday Period 3 — 10:40-11:25" is. Shared across every section
--    so the school structure is a single source of truth. `kind`
--    distinguishes academic periods, breaks, prayer slots, and Hifz
--    blocks so the UI can render them differently.
--
-- 2. timetable_entry — fills a slot with content. Polymorphic scope:
--    each row points to EITHER a class_section (academic + section-
--    bound hifz block) OR a hifz_group (group-bound block that may
--    pull students from multiple sections). Optional section_subject
--    FK ties the entry to a specific subject's teacher assignment;
--    teacher_user_id can also override for visiting teachers /
--    substitutes. Free-text `room` and `notes` for v1 — a proper room
--    booking model can come later.
--
-- A section's weekly view = join slot × entry filtered by
-- scope_section_id. A hifz group's view = same join filtered by
-- scope_hifz_group_id. The reads are cheap and the writes don't risk
-- cascading scope conflicts.
--
-- Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS timetable_slot (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                text NOT NULL,           -- "P1", "Break", "Zuhr", "Hifz block"
  -- ISO day of week: 1 = Monday … 7 = Sunday. Pakistan school weeks
  -- typically run Mon-Sat, so 1..6 will be the common range.
  day_of_week         smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time          time NOT NULL,
  end_time            time NOT NULL,
  kind                text NOT NULL DEFAULT 'academic'
                        CHECK (kind IN ('academic','break','prayer','hifz','assembly','other')),
  display_order       smallint NOT NULL DEFAULT 0,
  archived_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS timetable_slot_org_day
  ON timetable_slot(org_id, day_of_week, start_time)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS timetable_entry (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slot_id             uuid NOT NULL REFERENCES timetable_slot(id) ON DELETE CASCADE,
  -- Polymorphic scope — exactly ONE must be set. The CHECK is the cheap
  -- way to enforce XOR without a trigger.
  scope_section_id    uuid REFERENCES class_section(id) ON DELETE CASCADE,
  scope_hifz_group_id uuid REFERENCES hifz_group(id) ON DELETE CASCADE,
  -- What's being taught. Optional: a break / prayer slot has no
  -- subject; a hifz block has no class_subject. teacher_user_id may
  -- override the subject's regular teacher (substitute pattern).
  section_subject_id  uuid REFERENCES class_subject(id) ON DELETE SET NULL,
  teacher_user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  room                text,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (scope_section_id IS NOT NULL AND scope_hifz_group_id IS NULL) OR
    (scope_section_id IS NULL AND scope_hifz_group_id IS NOT NULL)
  ),
  -- One entry per (slot, scope). A section can't have two things in
  -- one slot — substitute through teacher_user_id, don't add a row.
  UNIQUE (slot_id, scope_section_id),
  UNIQUE (slot_id, scope_hifz_group_id)
);
CREATE INDEX IF NOT EXISTS timetable_entry_section
  ON timetable_entry(scope_section_id)
  WHERE scope_section_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS timetable_entry_hifz_group
  ON timetable_entry(scope_hifz_group_id)
  WHERE scope_hifz_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS timetable_entry_teacher
  ON timetable_entry(teacher_user_id)
  WHERE teacher_user_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_timetable_entry_updated'
  ) THEN
    CREATE TRIGGER trg_timetable_entry_updated BEFORE UPDATE ON timetable_entry
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;
