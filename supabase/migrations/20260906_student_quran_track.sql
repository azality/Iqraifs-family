-- Per-student Quran track.
--
-- A single Quran/Nazra period can hold children doing different things.
-- From Class IV a group typically contains mostly nazra readers plus the
-- occasional hafiz — a child who finished memorizing (here or at another
-- school) and now sits in the same period revising. Until now the daily
-- screen was chosen per SECTION, so those children all got one form.
--
--   quran_track  'nazra'    reads the Quran — position + ayah range
--                'hifz'     memorizing — sabaq / sabqi / manzil
--                'revision' finished memorizing, now revising — also
--                           sabaq / sabqi / manzil (school's call: a
--                           revising hafiz keeps the full trio)
--                NULL       not set, infer it (hifz section → hifz,
--                           hafiz → revision, otherwise nazra)
--
--   hafiz_since  when this child completed the Quran. Set by the office
--                for a child who arrived already hafiz, or written
--                automatically the moment a student's memorized coverage
--                reaches all 6236 ayahs — that is how the school "knows"
--                when one of its own finishes.

alter table student
  add column if not exists quran_track text,
  add column if not exists hafiz_since timestamptz;

alter table student
  drop constraint if exists student_quran_track_check;

alter table student
  add constraint student_quran_track_check
  check (quran_track is null or quran_track = any (array[
    'nazra'::text, 'hifz'::text, 'revision'::text
  ]));

comment on column student.quran_track is
  'Explicit Quran track. NULL means infer from section + hafiz_since.';
comment on column student.hafiz_since is
  'When the student completed memorizing the Quran. Auto-set at 6236 ayahs.';

create index if not exists idx_student_hafiz_since
  on student (org_id) where hafiz_since is not null;
