-- Segment extents for hifz_progress.juz_extent (7 Sep pilot feedback).
--
-- "To half (nisf)" left teachers asking WHICH half the student recited:
-- first quarter, or ruba-to-nisf? The cumulative start→X values stay
-- valid (existing rows keep meaning "from the start"), and four segment
-- values are added so a teacher can say exactly which slice was heard:
--
--   second_quarter   ruba → nisf      (¼ → ½)
--   third_quarter    nisf → salasa    (½ → ¾)
--   last_quarter     salasa → end     (¾ → end)
--   second_half      nisf → end       (½ → end)
--
-- Mirrored by safeExtent() in schoolPhaseC.tsx — keep in lockstep.

ALTER TABLE hifz_progress
  DROP CONSTRAINT IF EXISTS hifz_progress_juz_extent_check;

ALTER TABLE hifz_progress
  ADD CONSTRAINT hifz_progress_juz_extent_check
  CHECK (
    juz_extent IS NULL
    OR juz_extent IN (
      'quarter', 'half', 'three_quarters', 'full',
      'second_quarter', 'third_quarter', 'last_quarter', 'second_half'
    )
    OR juz_extent ~ '^to_surah:([1-9][0-9]{0,2})$'
  );
