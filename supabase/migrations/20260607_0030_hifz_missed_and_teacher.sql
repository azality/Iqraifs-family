-- =============================================================================
-- School Pilot — Hifz follow-ups: missed-sabaq flag + dedicated Hifz teacher.
--
-- Two additions:
--
-- 1. hifz_progress.missed — boolean flag so a teacher can log "missed
--    sabaq today" without needing a fake ayah range. The frontend writes
--    such rows with ayah_from = ayah_to = 1 and missed = true so the
--    NOT NULL CHECK constraints on those columns still hold; the trend
--    grid renders these days as red dots, and the summary aggregator
--    excludes them (a missed day doesn't count toward ayahs memorized).
--
-- 2. class_section.hifz_teacher_user_id — sibling to the existing
--    class_teacher_user_id. A Hifz school often has the regular class
--    teacher AND a separate Hifz teacher per section; both should have
--    teacher-level access to that section but each owns their own
--    surface (lessons / hifz_progress).
--
-- Idempotent.
-- =============================================================================

ALTER TABLE hifz_progress
  ADD COLUMN IF NOT EXISTS missed boolean NOT NULL DEFAULT false;

-- Trend queries are "last N days for this student", and they want to
-- include missed-day rows. The existing
-- hifz_progress_student_recorded index already serves that case, so no
-- new index needed.

ALTER TABLE class_section
  ADD COLUMN IF NOT EXISTS hifz_teacher_user_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

-- Mirror the existing class_teacher index so a teacher-side
-- "which sections do I teach Hifz for" query is fast.
CREATE INDEX IF NOT EXISTS class_section_hifz_teacher
  ON class_section(hifz_teacher_user_id)
  WHERE hifz_teacher_user_id IS NOT NULL;
