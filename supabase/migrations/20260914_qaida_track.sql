-- Noorani Qaida: the stage before Nazra (school request, 14 Sep 2026).
--
-- A new child in the intake class starts on Noorani Qaida, then reads the
-- Quran (nazra), then memorizes (hifz). Qaida is learnt lesson by lesson
-- (takhti) - letters and joining, not surahs - so a qaida entry carries a
-- lesson number and no surah/ayah at all.
--
--   hifz_progress.qaida_lesson  the lesson heard (1..60; the school's own
--                               lesson count lives in
--                               organizations.settings.qaida_lesson_count)
--   surah_number / ayah_from / ayah_to become optional for kind 'qaida'
--   ONLY - every other kind still requires them (position check below).
--
--   student.quran_track gains 'qaida'.

alter table hifz_progress
  add column if not exists qaida_lesson smallint;

alter table hifz_progress
  drop constraint if exists hifz_progress_qaida_lesson_range;
alter table hifz_progress
  add constraint hifz_progress_qaida_lesson_range
  check (qaida_lesson is null or qaida_lesson between 1 and 60);

alter table hifz_progress
  alter column surah_number drop not null,
  alter column ayah_from drop not null,
  alter column ayah_to drop not null;

alter table hifz_progress
  drop constraint if exists hifz_progress_position_check;
alter table hifz_progress
  add constraint hifz_progress_position_check
  check (
    (kind = 'qaida' and qaida_lesson is not null)
    or (kind <> 'qaida' and surah_number is not null and ayah_from is not null and ayah_to is not null)
  );

alter table hifz_progress
  drop constraint if exists hifz_progress_kind_check;
alter table hifz_progress
  add constraint hifz_progress_kind_check
  check (kind = any (array[
    'memorized'::text,
    'revised'::text,
    'tested'::text,
    'sabaq'::text,
    'sabqi'::text,
    'manzil'::text,
    'nazra'::text,
    'nazra_revision'::text,
    'qaida'::text
  ]));

alter table student
  drop constraint if exists student_quran_track_check;
alter table student
  add constraint student_quran_track_check
  check (quran_track is null or quran_track = any (array[
    'qaida'::text, 'nazra'::text, 'hifz'::text, 'revision'::text
  ]));

comment on column hifz_progress.qaida_lesson is
  'Noorani Qaida lesson (takhti) heard. Set only for kind qaida, which has no surah/ayah.';
