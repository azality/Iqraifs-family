-- Quiz engine (pilot, 2026-09-02).
--
-- A quiz is an assignment (kind 'quiz'/'test') with attached MCQ
-- questions. Students answer in the portal; the attempt is auto-scored
-- into their existing `grade` row (scaled to the assignment's
-- max_score), so the gradebook needs no changes. Answers live on the
-- existing assignment_submission row (one per assignment x student).
--
-- Applied to the live DB 2026-09-02 via the temporary nonce-gated
-- endpoint. This file is the committed record.

CREATE TABLE IF NOT EXISTS quiz_question (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  assignment_id uuid NOT NULL REFERENCES assignment(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,   -- array of option strings (2..6)
  correct_index int NOT NULL DEFAULT 0,
  display_order int NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quiz_question_assignment
  ON quiz_question(assignment_id);

ALTER TABLE assignment_submission
  ADD COLUMN IF NOT EXISTS quiz_answers jsonb,
  ADD COLUMN IF NOT EXISTS quiz_score numeric;
