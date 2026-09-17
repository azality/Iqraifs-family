-- Per-student exam syllabus — the Hifz "مقدارِ خواندگی" line.
--
-- In regular school every child in a class sits the same paper, so the
-- syllabus lives on the curriculum. In Hifz each child is examined on
-- their OWN memorized portion, which the school currently writes by
-- hand into every child's diary before each exam (Ambreen, 17 Sep).
--
-- One row per (exam, student). `portion` is the human line the slip
-- prints. `published_at` is the gate: until it is stamped the row is a
-- draft the teacher is still reviewing; once stamped it is locked in
-- and the parent can see it in the portal — which is what retires the
-- handwritten notice.

create table if not exists student_exam_syllabus (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  exam_id      uuid not null references exam(id) on delete cascade,
  student_id   uuid not null references student(id) on delete cascade,
  -- Snapshot of the track at the time the portion was set: the Quran
  -- questions come from Hifz for memorizers and Nazra for readers, and
  -- a child moving tracks later must not silently rewrite history.
  track        text,
  -- The line the exam slip prints, e.g. "پارہ ۱ تا ۱۲" / "Para 1-12".
  portion      text not null,
  -- 'proposed' = still exactly what the system derived from the child's
  -- own hifz record; 'edited' = a teacher changed it. Lets the roster
  -- show at a glance how much was actually reviewed.
  source       text not null default 'proposed',
  notes        text,
  published_at timestamptz,
  updated_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (exam_id, student_id)
);

create index if not exists idx_student_exam_syllabus_org_exam
  on student_exam_syllabus (org_id, exam_id);
create index if not exists idx_student_exam_syllabus_student
  on student_exam_syllabus (student_id);

-- Service-role only, like every other school table: the Edge Function
-- is the single writer and does its own gating.
alter table student_exam_syllabus enable row level security;

notify pgrst, 'reload schema';
