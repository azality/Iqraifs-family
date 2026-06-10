-- =============================================================================
-- time_off_request — staff leave + student absence self-service.
-- =============================================================================
-- Why:
--   Teachers should be able to request a day off / vacation / short
--   break themselves, and parents should be able to report a student
--   absence ahead of time (family travel, doctor's visit). The admin
--   reviews and approves/rejects.
--
-- Shape:
--   - One row per request. `subject_type` distinguishes staff vs student
--     so the same table can power both surfaces with one set of admin
--     review screens.
--   - Time range stored as date + optional partial-day start_time /
--     end_time so a "30 min break" and a "two-week vacation" share the
--     same model.
--   - Status flows: pending → approved | rejected | cancelled (by the
--     requester before review).
-- =============================================================================

CREATE TABLE IF NOT EXISTS time_off_request (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subject_type      text NOT NULL CHECK (subject_type IN ('teacher', 'student')),
  subject_id        uuid NOT NULL,
  kind              text NOT NULL CHECK (kind IN (
                      'vacation', 'sick', 'personal', 'short_break',
                      'family_emergency', 'medical', 'other')),
  start_date        date NOT NULL,
  end_date          date NOT NULL,
  start_time        time,  -- optional partial-day
  end_time          time,
  reason            text,
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at       timestamptz,
  reviewer_notes    text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS time_off_org_status
  ON time_off_request(org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS time_off_subject
  ON time_off_request(subject_type, subject_id, start_date DESC);
CREATE INDEX IF NOT EXISTS time_off_org_dates
  ON time_off_request(org_id, start_date, end_date);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_time_off_updated'
  ) THEN
    CREATE TRIGGER trg_time_off_updated BEFORE UPDATE ON time_off_request
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;

-- Verify
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables WHERE table_name = 'time_off_request'
) AS has_time_off_request;
