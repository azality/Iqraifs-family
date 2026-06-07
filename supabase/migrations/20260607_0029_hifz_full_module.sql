-- =============================================================================
-- School Pilot — Full Hifz module.
--
-- Two changes:
--
-- 1. Extend `hifz_progress` with the fields a Karachi school actually
--    captures every day:
--      - juz_number / page_number     (location anchors)
--      - mistakes_count               (raw error count for trend lines)
--      - tajweed_notes / fluency_notes (specific, NOT lumped into notes)
--      - teacher_remarks              (catch-all teacher note, separate
--                                      from the spec'd tajweed/fluency)
--      - parent_comments              (PARENT-visible field; `notes` is
--                                      teacher-internal)
--      - daily_target / next_target   (today's target + tomorrow's plan)
--      - missed_target_reason         (why the kid didn't hit target)
--      - parent_action                (what the parent should do tonight)
--
-- 2. One-time backfill of legacy `sabaq_logs` rows into `hifz_progress`
--    so the summary aggregator (which only reads `hifz_progress`) stops
--    showing 0 ayahs for kids whose teachers used the legacy
--    LogSabaqDialog flow. After this PR all writes go to
--    `hifz_progress`; `sabaq_logs` keeps its data for history but isn't
--    written to anymore.
--
-- All new columns nullable; existing rows behave unchanged.
-- Idempotent.
-- =============================================================================

-- ──────────────────────────────────────────────────────────────────────
-- 1. hifz_progress field expansion
-- ──────────────────────────────────────────────────────────────────────
ALTER TABLE hifz_progress
  ADD COLUMN IF NOT EXISTS juz_number             smallint,
  ADD COLUMN IF NOT EXISTS page_number            smallint,
  ADD COLUMN IF NOT EXISTS mistakes_count         smallint,
  ADD COLUMN IF NOT EXISTS tajweed_notes          text,
  ADD COLUMN IF NOT EXISTS fluency_notes          text,
  ADD COLUMN IF NOT EXISTS teacher_remarks        text,
  -- The parent-visible field. `notes` stays teacher-internal so a
  -- teacher can flag "kid argued, distracted" without showing it to
  -- the parent verbatim.
  ADD COLUMN IF NOT EXISTS parent_comments        text,
  ADD COLUMN IF NOT EXISTS daily_target           text,
  ADD COLUMN IF NOT EXISTS next_target            text,
  ADD COLUMN IF NOT EXISTS missed_target_reason   text,
  -- Concrete next step for the parent ("Revise Surah Al-Mulk after
  -- Maghrib"). Renders in the parent portal Hifz card.
  ADD COLUMN IF NOT EXISTS parent_action          text;

ALTER TABLE hifz_progress
  DROP CONSTRAINT IF EXISTS hifz_progress_mistakes_count_check;
ALTER TABLE hifz_progress
  ADD CONSTRAINT hifz_progress_mistakes_count_check
  CHECK (mistakes_count IS NULL OR mistakes_count >= 0);

ALTER TABLE hifz_progress
  DROP CONSTRAINT IF EXISTS hifz_progress_juz_check;
ALTER TABLE hifz_progress
  ADD CONSTRAINT hifz_progress_juz_check
  CHECK (juz_number IS NULL OR (juz_number BETWEEN 1 AND 30));

-- ──────────────────────────────────────────────────────────────────────
-- 2. Backfill from legacy sabaq_logs → hifz_progress
--
-- The summary aggregator only reads hifz_progress. If teachers used
-- the legacy LogSabaqDialog flow, those rows landed in sabaq_logs and
-- never counted toward "ayahs memorized" — explaining the reported
-- "Hifz entry exists but summary shows 0 ayahs" bug.
--
-- We do a NOT EXISTS guard so re-running this migration doesn't
-- duplicate entries. Match key is (student_id, surah_number,
-- ayah_from, ayah_to, recorded date) — the same combination used by
-- computeMemorizedTotals to dedupe.
--
-- We map:
--   sabaq_logs.tajweed_rating (1-5) → hifz_progress.quality
--     5 -> excellent, 4 -> good, 3 -> needs_practice, <=2 -> weak
--   sabaq_logs.notes      → hifz_progress.notes
--   kind = 'sabaq' (it's literally the sabaq table)
-- ──────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'sabaq_logs'
  ) THEN
    INSERT INTO hifz_progress (
      org_id, student_id, surah_number, ayah_from, ayah_to,
      kind, quality, notes, recorded_by, recorded_at, created_at
    )
    SELECT
      s.org_id,
      sl.child_id,
      COALESCE(sl.surah_number, 1),
      COALESCE(sl.ayah_start, 1),
      COALESCE(sl.ayah_end, COALESCE(sl.ayah_start, 1)),
      'sabaq',
      CASE
        WHEN sl.tajweed_rating >= 5 THEN 'excellent'
        WHEN sl.tajweed_rating = 4   THEN 'good'
        WHEN sl.tajweed_rating = 3   THEN 'needs_practice'
        WHEN sl.tajweed_rating <= 2  THEN 'weak'
        ELSE NULL
      END,
      sl.notes,
      sl.logged_by,
      sl.logged_at,
      sl.logged_at
    FROM sabaq_logs sl
    JOIN student s ON s.id = sl.child_id
    WHERE NOT EXISTS (
      SELECT 1 FROM hifz_progress hp
      WHERE hp.student_id    = sl.child_id
        AND hp.surah_number  = COALESCE(sl.surah_number, 1)
        AND hp.ayah_from     = COALESCE(sl.ayah_start, 1)
        AND hp.ayah_to       = COALESCE(sl.ayah_end, COALESCE(sl.ayah_start, 1))
        AND date_trunc('day', hp.recorded_at) = date_trunc('day', sl.logged_at)
    );
  END IF;
END $$;
