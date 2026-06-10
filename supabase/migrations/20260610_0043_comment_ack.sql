-- =============================================================================
-- comment_ack — parent one-tap acknowledgment of teacher comments.
-- =============================================================================
-- Why:
--   Parents see teacher comments (behavior, hifz, lesson, exam, report card)
--   but have no way to close the loop. A one-tap "read / thank you /
--   follow-up" is enough to tell the teacher their message landed.
--
-- Comment IDs are composite strings from the unified teacher-comments feed:
--   "behavior:<uuid>", "hifz:<uuid>", "lesson:<uuid>",
--   "exam_note:<uuid>", "report_card_subject:<uuid>", etc.
-- We store the kind and ref separately for indexability + future per-kind
-- aggregations.
--
-- A single (subject, kind, ref) can accumulate multiple actions ("read" +
-- "thank_you"), but each (subject, kind, ref, action) is unique.
-- =============================================================================

CREATE TABLE IF NOT EXISTS comment_ack (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  -- Who acked. PIN-authenticated portal subjects: type='parent' uses
  -- parent.id, type='student' uses student.id. We store both columns
  -- to keep the FK explicit either way.
  subject_type    text NOT NULL CHECK (subject_type IN ('parent', 'student')),
  subject_id      uuid NOT NULL,
  comment_kind    text NOT NULL,
  comment_ref     uuid NOT NULL,
  action          text NOT NULL CHECK (action IN ('read', 'thank_you', 'follow_up')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_type, subject_id, comment_kind, comment_ref, action)
);

CREATE INDEX IF NOT EXISTS comment_ack_lookup
  ON comment_ack(subject_type, subject_id, comment_kind, comment_ref);
CREATE INDEX IF NOT EXISTS comment_ack_student
  ON comment_ack(student_id, created_at DESC);

-- Verify
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'comment_ack') AS has_comment_ack;
