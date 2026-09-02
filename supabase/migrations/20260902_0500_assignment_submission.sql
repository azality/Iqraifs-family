-- Digital homework hand-in (pilot, 2026-09-02).
--
-- Students (or parents on their behalf) submit photos/PDFs of completed
-- homework against an assignment from the portal; teachers see a
-- submissions list on the assignment page and can mark each as seen.
-- One row per (assignment, student); resubmits append to `attachments`
-- (jsonb array of {url, name} pointing at the public school-files
-- bucket under <orgId>/submissions/<studentId>/).
--
-- Applied to the live DB 2026-09-02 via the temporary nonce-gated
-- endpoint (remote migration history is unrecorded; supabase db push is
-- unsafe here). This file is the committed record.

CREATE TABLE IF NOT EXISTS assignment_submission (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  assignment_id uuid NOT NULL REFERENCES assignment(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text,
  submitted_via text NOT NULL DEFAULT 'student',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  UNIQUE (assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_submission_assignment
  ON assignment_submission(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submission_student
  ON assignment_submission(student_id);
