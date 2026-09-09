-- Two more segment extents for hifz_progress.juz_extent (Muneeb,
-- 10 Sep 2026): teachers also hear ranges that START at ruba and run
-- past nisf, which the 7-Sep segment set couldn't express:
--
--   middle_half           ruba → salasa   (¼ → ¾)
--   last_three_quarters   ruba → end      (¼ → end)
--
-- Mirrored by safeExtent() in schoolPhaseC.tsx and PARA_EXTENT_OPTIONS
-- in src/utils/hifzExtent.ts — keep all three in lockstep.

ALTER TABLE hifz_progress
  DROP CONSTRAINT IF EXISTS hifz_progress_juz_extent_check;

ALTER TABLE hifz_progress
  ADD CONSTRAINT hifz_progress_juz_extent_check
  CHECK (
    juz_extent IS NULL
    OR juz_extent IN (
      'quarter', 'half', 'three_quarters', 'full',
      'second_quarter', 'third_quarter', 'last_quarter', 'second_half',
      'middle_half', 'last_three_quarters'
    )
    OR juz_extent ~ '^to_surah:([1-9][0-9]{0,2})$'
  );
