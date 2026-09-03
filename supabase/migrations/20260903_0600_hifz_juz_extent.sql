-- Sabqi by juz/para (pilot: Qari Waqar via Muneeb, Sep 3 2026).
-- Hifz teachers reference sabqi in para terms — "para 26 until nisf
-- (half)", "ruba (quarter)", "salasa (3/4)", or "para 30 start up to
-- Surah At-Teen" — not surah+ayah ranges. Page numbers were considered
-- and rejected (every mushaf edition differs).
--
-- juz_extent stores HOW MUCH of juz_number the entry covers:
--   'quarter' | 'half' | 'three_quarters' | 'full' | 'to_surah:<n>'
-- Rows carrying it keep surah_number/ayah_from/ayah_to as the juz-start
-- marker (same display-only convention manzil entries already use);
-- computeMemorizedTotals only counts kind IN ('memorized','sabaq'), so
-- these markers can never inflate ayah totals.

ALTER TABLE hifz_progress
  ADD COLUMN IF NOT EXISTS juz_extent text;

ALTER TABLE hifz_progress
  DROP CONSTRAINT IF EXISTS hifz_progress_juz_extent_check;
ALTER TABLE hifz_progress
  ADD CONSTRAINT hifz_progress_juz_extent_check
  CHECK (
    juz_extent IS NULL
    OR juz_extent IN ('quarter', 'half', 'three_quarters', 'full')
    OR juz_extent ~ '^to_surah:([1-9][0-9]{0,2})$'
  );
