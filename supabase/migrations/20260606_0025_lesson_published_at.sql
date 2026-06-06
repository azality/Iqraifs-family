-- =============================================================================
-- School Pilot — Lesson visibility (lesson.published_at).
--
-- Adds an explicit publish timestamp to lesson so a teacher can pre-plan
-- next week's lessons without students previewing them. Default visibility
-- rule (enforced in the portal handler, not in DB):
--
--   Student sees lesson IF
--     (published_at IS NOT NULL AND published_at <= now())
--       -- teacher explicitly published (early or on time)
--     OR
--     (published_at IS NULL AND lesson_date <= today)
--       -- teacher logged a same-day lesson; auto-visible
--
-- Staff (teacher / admin) always sees every lesson, with isVisibleToStudents
-- on each row so the planning view can render Hidden / Published badges.
--
-- Idempotent.
-- =============================================================================

ALTER TABLE lesson
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- Index helps the portal-side filter where published_at IS NOT NULL.
CREATE INDEX IF NOT EXISTS lesson_section_published
  ON lesson(class_section_id, published_at DESC)
  WHERE published_at IS NOT NULL;

-- For all PRE-existing lessons (which had no published_at column), assume
-- they were already visible — set published_at = lesson_date::timestamptz
-- so they behave like 'auto-published on lesson date' rows. New lessons
-- explicitly choose their visibility via the LessonForm 'Visibility'
-- selector in the same release.
UPDATE lesson
SET published_at = (lesson_date::timestamp AT TIME ZONE 'UTC')
WHERE published_at IS NULL
  AND lesson_date <= CURRENT_DATE;
