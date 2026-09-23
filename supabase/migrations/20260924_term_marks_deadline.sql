-- Marks deadline + scheduled results day (23 Sep 2026).
--
-- "If we leave the tabulation open indefinitely there's no pressure on
-- the teachers" - the office gave everyone until 2pm by voice note,
-- and nothing enforced it. Per TERM the admin now sets:
--
--   marks_deadline_at   - teachers' marks entry LOCKS at this moment.
--                         The admin extends it by setting it again, and
--                         can grant a per-teacher exception below.
--   results_publish_at  - results day: FINALIZED report cards become
--                         visible to parents at this moment (stamped
--                         lazily on the next read after the time - no
--                         cron in this stack). Manual publish still
--                         works and wins if earlier.
--
-- marks_deadline_exception: the admin's escape hatch - one teacher,
-- until one moment ("one-time access to adjust marks"). Grants are
-- rows, so who got what and from whom is on the record.
--
-- Idempotent: safe to re-run.

ALTER TABLE academic_term ADD COLUMN IF NOT EXISTS marks_deadline_at timestamptz;
ALTER TABLE academic_term ADD COLUMN IF NOT EXISTS results_publish_at timestamptz;

CREATE TABLE IF NOT EXISTS marks_deadline_exception (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  term_id uuid NOT NULL REFERENCES academic_term(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  until_at timestamptz NOT NULL,
  note text,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_marks_exception_term_user
  ON marks_deadline_exception(term_id, user_id);
ALTER TABLE marks_deadline_exception ENABLE ROW LEVEL SECURITY;
