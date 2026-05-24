-- =============================================================================
-- School Pilot — Phase C.1 schema (daily sabaq + hifz progress)
-- =============================================================================
-- Adds tables for daily lesson tracking and Quran memorization progress:
--   lesson, hifz_progress.
--
-- Scope:
--   - Builds on Phase A (student, class_section) and Phase B (daily ops).
--   - Each hifz_progress row is a single observation event. Students will have
--     many rows over time; "summary" endpoints derive totals in the API layer.
--
-- Idempotency:
--   - Every CREATE uses IF NOT EXISTS.
--   - Triggers are wrapped in DO blocks that check pg_trigger first.
--   - Safe to re-run end-to-end with no side effects.
--
-- Security:
--   - No RLS policies are added — matches the existing pattern. All scope
--     checks happen in the edge function layer with the service role.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. lesson — daily sabaq / topic taught to a section
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lesson (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id)  ON DELETE CASCADE,
  class_section_id    uuid NOT NULL REFERENCES class_section(id)  ON DELETE CASCADE,
  lesson_date         date NOT NULL,
  title               text NOT NULL,
  body                text,
  video_url           text,
  audio_url           text,
  attachments         jsonb NOT NULL DEFAULT '[]'::jsonb,
  taught_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lesson_section_date
  ON lesson(class_section_id, lesson_date DESC);
CREATE INDEX IF NOT EXISTS lesson_org_date
  ON lesson(org_id, lesson_date DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_lesson_updated'
  ) THEN
    CREATE TRIGGER trg_lesson_updated BEFORE UPDATE ON lesson
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;


-- -----------------------------------------------------------------------------
-- 2. hifz_progress — Quran memorization tracking (per-student event log)
-- -----------------------------------------------------------------------------
-- `kind` includes traditional Hifz terms used daily by teachers:
--   sabaq  — new lesson memorized today
--   sabqi  — recent revision (last ~7 days)
--   manzil — older revision (rolling weekly portion)
--   memorized / revised / tested — generic categories
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hifz_progress (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id)  ON DELETE CASCADE,
  student_id          uuid NOT NULL REFERENCES student(id)        ON DELETE CASCADE,
  surah_number        int  NOT NULL CHECK (surah_number BETWEEN 1 AND 114),
  ayah_from           int  NOT NULL CHECK (ayah_from >= 1),
  ayah_to             int  NOT NULL CHECK (ayah_to >= ayah_from),
  kind                text NOT NULL CHECK (kind IN (
                        'memorized','revised','tested','sabaq','sabqi','manzil'
                      )),
  quality             text CHECK (quality IN (
                        'excellent','good','needs_practice','weak'
                      )),
  notes               text,
  recorded_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at         timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hifz_progress_student_recorded
  ON hifz_progress(student_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS hifz_progress_org_recorded
  ON hifz_progress(org_id, recorded_at DESC);


-- =============================================================================
-- End of Phase C.1 schema.
-- =============================================================================
