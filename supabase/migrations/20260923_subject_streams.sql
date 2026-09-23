-- Streams / electives (23 Sep 2026).
--
-- Pakistani matric: entering Class IX a child picks a stream - this
-- school offers Biology or Computer - and studies ONE of them. The
-- model had every student sitting every class subject, so Class IX's
-- Biology teacher stamped her 20 computer students "absent" and every
-- absent stamp added a 75-mark paper to a child who does not take the
-- subject, unranking the lot.
--
-- Kept generic, per the school-authored-attributes rule (any school
-- must be able to set this up without us):
--
--   class_subject.elective_group   - subjects sharing a group name are
--                                    alternatives; a child takes exactly
--                                    one of them ("Stream": Biology |
--                                    Computer). Null = everyone takes it.
--   student_subject_choice         - which subject of a group the child
--                                    takes. A child with NO choice in a
--                                    group sits none of its subjects and
--                                    is flagged on every surface until
--                                    the school decides.
--
-- Idempotent: safe to re-run.

ALTER TABLE class_subject ADD COLUMN IF NOT EXISTS elective_group text;

CREATE TABLE IF NOT EXISTS student_subject_choice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  student_id uuid NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  class_subject_id uuid NOT NULL REFERENCES class_subject(id) ON DELETE CASCADE,
  chosen_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, class_subject_id)
);
CREATE INDEX IF NOT EXISTS idx_student_subject_choice_student
  ON student_subject_choice(student_id);
CREATE INDEX IF NOT EXISTS idx_student_subject_choice_subject
  ON student_subject_choice(class_subject_id);

-- Default-deny RLS like every public table (service role bypasses).
ALTER TABLE student_subject_choice ENABLE ROW LEVEL SECURITY;
