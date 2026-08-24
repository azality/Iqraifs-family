-- Attendance integrity (pilot): early release + discrepancy flags.
--
-- A. Early release — a student who attended but left before close
--    (unwell, family pickup). The day stays `present` (he DID attend);
--    left_early_at/reason record when and why he left. Custody answer
--    to "when did he leave school?".
--
-- B. attendance_flag — a subject teacher who counts fewer heads than
--    the register can raise a flag ("marked present but absent in my
--    3rd-period class"). The class teacher resolves or dismisses;
--    decision power stays with the CT.
--
-- Applied 2026-08-24 via the one-off service-gated DDL endpoint
-- (remote migration history is unrecorded for this project; db push
-- would replay non-idempotent early migrations). Statements are
-- idempotent per house style.

ALTER TABLE school_attendance ADD COLUMN IF NOT EXISTS left_early_at timestamptz;
ALTER TABLE school_attendance ADD COLUMN IF NOT EXISTS left_early_reason text;

CREATE TABLE IF NOT EXISTS attendance_flag (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL,
  class_section_id uuid NOT NULL REFERENCES class_section(id) ON DELETE CASCADE,
  student_id       uuid REFERENCES student(id) ON DELETE CASCADE,
  attendance_date  date NOT NULL,
  note             text NOT NULL,
  raised_by        uuid NOT NULL,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  resolved_by      uuid,
  resolved_at      timestamptz,
  resolution       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_flag_section_date ON attendance_flag(class_section_id, attendance_date);
CREATE INDEX IF NOT EXISTS attendance_flag_open ON attendance_flag(class_section_id, status);
