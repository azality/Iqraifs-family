-- =============================================================================
-- Year rollover — student lifecycle + audit trail.
-- =============================================================================
-- Why:
--   Term 1 of 2026-27 will end. There's currently no way to move kids to
--   the next grade, mark seniors as graduated, or carry fee plans into
--   the new year. This migration adds:
--     1. student.archived_at + student.status  — soft-archive students who
--        graduate, transfer, or withdraw; keeps history intact.
--     2. year_rollover audit table              — every rollover records
--        what happened so the principal can see what they did last year.
-- =============================================================================

ALTER TABLE student
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS status      text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'graduated', 'transferred', 'withdrawn'));

CREATE INDEX IF NOT EXISTS student_org_status
  ON student(org_id, status)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS year_rollover (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_year         text NOT NULL,
  to_year           text NOT NULL,
  -- summary holds per-class counts + per-student decisions for replay.
  summary           jsonb NOT NULL DEFAULT '{}'::jsonb,
  executed_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  executed_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS year_rollover_org_executed
  ON year_rollover(org_id, executed_at DESC);

-- Verify
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'year_rollover') AS has_year_rollover,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student' AND column_name = 'status') AS student_has_status;
