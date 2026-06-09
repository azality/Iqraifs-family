-- =============================================================================
-- School Pilot — Hifz Groups.
--
-- Spec calls out the structural reality of a Hifz + school model: one
-- child belongs to a conventional class section (e.g. Grade 3-A) AND a
-- Hifz group (e.g. Hifz Group B) at the same time. The Hifz group
-- usually has a different teacher and meets at a different time, and
-- shouldn't be forced into the same shape as English/Math subjects.
--
-- This migration adds `hifz_group` as a peer of `class_section` and a
-- `hifz_group_id` foreign key on `student`. One group per student for
-- v1 — most pilot schools don't need cross-group membership.
--
-- The existing `class_section.hifz_teacher_user_id` column (PR #156)
-- stays — it remains the right home for a section-level Hifz teacher
-- when the school doesn't run separate Hifz groupings. The new column
-- on hifz_group is the alternative path; the Hifz-progress POST gate
-- accepts EITHER one when granting access.
--
-- Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS hifz_group (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  description           text,
  hifz_teacher_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  display_order         smallint NOT NULL DEFAULT 0,
  archived_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);
CREATE INDEX IF NOT EXISTS hifz_group_org
  ON hifz_group(org_id)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS hifz_group_teacher
  ON hifz_group(hifz_teacher_user_id)
  WHERE hifz_teacher_user_id IS NOT NULL;

ALTER TABLE student
  ADD COLUMN IF NOT EXISTS hifz_group_id uuid
    REFERENCES hifz_group(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS student_hifz_group
  ON student(hifz_group_id)
  WHERE hifz_group_id IS NOT NULL;
