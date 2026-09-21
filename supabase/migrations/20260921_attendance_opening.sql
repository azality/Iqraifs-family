-- Attendance carried forward from the school's own register.
--
-- IFS opened on 4 May 2026 and kept attendance on paper; our roll call
-- only starts 19 Aug. The school handed in one total per child —
-- "present 58 of 62 working days" — per class, each sheet counted up to
-- a slightly different day (21 Sep). Without it a report card printed
-- today would claim the year began in late August.
--
-- One row per student. `as_of_date` is the last day the hand count
-- covers; the reader ignores its own roll call up to that day so the
-- overlapping weeks (19 Aug - 18 Sep) are never counted twice.

create table if not exists student_attendance_opening (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  student_id    uuid not null references student(id) on delete cascade,
  -- Days present. The register counted a late arrival as present, so
  -- this is "present or late", matching attendanceTotals().
  days_present  integer not null check (days_present >= 0),
  -- Working days that count was out of. Differs by class: the sheets
  -- came in on different days (Senior 60, Classes I/II/IX/X 61,
  -- Classes III-VIII 62).
  working_days  integer not null check (working_days > 0),
  as_of_date    date not null,
  -- Where the number came from, e.g. 'register-2026-09' for the
  -- handwritten sheets, so a later correction is distinguishable.
  source        text not null default 'register',
  notes         text,
  updated_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (student_id),
  constraint present_not_over_working check (days_present <= working_days)
);

create index if not exists idx_attendance_opening_org
  on student_attendance_opening (org_id);

-- Service-role only, like every other school table: the Edge Function is
-- the single writer and does its own gating.
alter table student_attendance_opening enable row level security;

notify pgrst, 'reload schema';
