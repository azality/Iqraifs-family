-- Completing the Quran is declared by a teacher, not by arithmetic.
--
-- v1.0.99 stamped student.hafiz_since automatically the moment logged
-- coverage reached 6236 ayahs. Two problems with that:
--
--   * It is a coverage tripwire, not a judgement. Quality is not
--     considered — a sabaq logged 'weak' counts the same as a strong
--     one — and in a real hifz school a child is declared hafiz after a
--     full recitation test, not when a sum crosses a threshold.
--   * It happened silently. The biggest milestone in a hifz school
--     passed with nothing on screen and nobody told.
--
-- So the detection stays (it is genuinely useful) but becomes a
-- SUGGESTION the teacher confirms:
--
--   hifz_coverage_complete_at  when logged sabaq/memorized first covered
--                              all 6236 ayahs. Written by the system.
--   hafiz_since                the milestone itself. Written only when a
--                              human confirms, or by the office for a
--                              child who arrived already hafiz.
--   hafiz_confirmed_by         who confirmed it.

alter table student
  add column if not exists hifz_coverage_complete_at timestamptz,
  add column if not exists hafiz_confirmed_by uuid;

comment on column student.hifz_coverage_complete_at is
  'System-detected: logged sabaq/memorized first covered all 6236 ayahs. A suggestion, not the milestone.';
comment on column student.hafiz_confirmed_by is
  'User who confirmed the hafiz milestone. Null for office-entered arrivals.';

-- Anyone already auto-stamped by v1.0.99 keeps their date, but we record
-- that it came from detection rather than a person.
update student
   set hifz_coverage_complete_at = hafiz_since
 where hafiz_since is not null
   and hifz_coverage_complete_at is null;
