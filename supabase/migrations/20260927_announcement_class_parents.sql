-- class_parents joins the audience_kind CHECK (24 Sep 2026).
--
-- v1.7.0 shipped the "Parents of a class" audience, but the CHECK from
-- 0027 still listed only the ten older kinds - the very first
-- class_parents POST answered 500 (suite check 122 caught it on the
-- live backend). Same drop-and-re-add dance as 0027.
--
-- Idempotent: safe to re-run.

ALTER TABLE announcement DROP CONSTRAINT IF EXISTS announcement_audience_kind_check;

ALTER TABLE announcement
  ADD CONSTRAINT announcement_audience_kind_check
  CHECK (audience_kind IN (
    'whole_school',
    'class_section',
    'parents_only',
    'students_only',
    'specific_students',
    'staff',
    'teachers',
    'class',
    'class_parents',
    'program',
    'subject'
  ));
