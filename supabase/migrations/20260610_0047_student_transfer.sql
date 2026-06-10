-- =============================================================================
-- student_transfer — audit row for inter-campus moves.
-- =============================================================================
-- Why:
--   When a child moves from one Iqra campus to another we need to update
--   student.org_id + class_section_id and record what happened. The audit
--   row is small but precious: it's how the chain principal answers
--   "wait, when did this kid show up at Clifton?".
--
-- Hard-move semantics (Phase 2):
--   student row is mutated in place; org_id + class_section_id change.
--   Historical attendance / behavior / grade / fee_status rows keep
--   their old org_id (they were written at the old campus). The chain
--   dashboard sees them under the old campus; the student's own portal
--   shows post-transfer data going forward.
--
-- "Continuous record across the group" (parent portal aggregates pre +
-- post transfer history) is a separate follow-up.
-- =============================================================================

CREATE TABLE IF NOT EXISTS student_transfer (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      uuid NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  school_group_id uuid REFERENCES school_group(id) ON DELETE SET NULL,
  from_org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  to_org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  from_section_id uuid REFERENCES class_section(id) ON DELETE SET NULL,
  to_section_id   uuid REFERENCES class_section(id) ON DELETE SET NULL,
  reason          text,
  executed_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  executed_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_transfer_student
  ON student_transfer(student_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS student_transfer_group
  ON student_transfer(school_group_id, executed_at DESC)
  WHERE school_group_id IS NOT NULL;

-- Verify
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables WHERE table_name = 'student_transfer'
) AS has_student_transfer;
