-- Attendance day notes (pilot ask, Sep 3 2026): when whole-school
-- attendance is unusual — a strike or protest call in Karachi keeping
-- kids home — the admin records WHY against that date, so a dip in the
-- history is explainable months later ("yeah, that was the strike").
-- One note per org per date; upsert semantics.

CREATE TABLE IF NOT EXISTS attendance_day_note (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  note_date   date NOT NULL,
  note        text NOT NULL,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, note_date)
);

CREATE INDEX IF NOT EXISTS attendance_day_note_org_date
  ON attendance_day_note(org_id, note_date DESC);
