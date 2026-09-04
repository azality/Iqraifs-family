-- Exam datesheet (1st Assessment 2026-27 and beyond).
--
-- The school publishes a written-assessment timetable per class: one
-- paper per (class, date). The existing `exam` table models a MARKS
-- event (org-level, one date, scored per student+subject); it cannot
-- express "Class IV sits Maths on Fri 11 Sep, 8:00–11:30". This table
-- is the published schedule that parents, students and staff read.
--
-- subject_label is stored VERBATIM from the school's document ("Sst",
-- "Pak. studies", "Computer/Biology") because it is a published
-- communication; class_subject_id is a best-effort link for later
-- joins and may be null when the label doesn't map 1:1.

create table if not exists exam_schedule (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  term_id uuid references academic_term(id) on delete set null,
  class_id uuid not null references class(id) on delete cascade,
  class_subject_id uuid references class_subject(id) on delete set null,
  subject_label text not null,
  exam_date date not null,
  start_time time,
  end_time time,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_exam_schedule_slot
  on exam_schedule (class_id, exam_date, subject_label);
create index if not exists ix_exam_schedule_org_date
  on exam_schedule (org_id, exam_date);
create index if not exists ix_exam_schedule_term
  on exam_schedule (term_id);

-- School-wide instructions printed under the datesheet (fee clearance,
-- no re-assessment, timings, stationery). Per term because each
-- assessment republishes them.
alter table academic_term
  add column if not exists exam_instructions text[];
