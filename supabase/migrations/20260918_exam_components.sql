-- Exam components — the rows on a paper, and one child's mark against each.
--
-- The Hifz half-yearly slip (17 Oct 2026) reads:
--
--   سوال اول            20  ┐
--   سوال دوم            20  ├ حفظ القرآن / ناظرہ   (60)
--   سوال سوم            20  ┘
--   صفات و مخارج        20
--   لہجہ                10
--   مسائل               10
--   میزان              100
--
-- Deliberately NOT modelled on class_subject. The school's Hifz classes
-- teach Sabaq, Sabqi, Manzil, Mutala and Islamiyah, and the paper is not
-- split that way at all: the three questions are drawn from the child's
-- whole memorised portion, Mutala is not examined, and مسائل belongs to
-- Islamiyat (Ambreen, 18 Sep). What is taught and what is marked are
-- different lists, so they get different tables.
--
-- Components are data, per exam. A school whose paper looks nothing like
-- this configures their own and needs nothing from us.

create table if not exists exam_component (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  exam_id       uuid not null references exam(id) on delete cascade,
  -- The row's own name, as printed: "سوال اول".
  name          text not null,
  -- Rows the slip braces together under one heading, e.g. the three
  -- questions under "حفظ القرآن / ناظرہ". Null for an ungrouped row.
  -- Only a label: the subtotal is computed from the rows that share it.
  group_label   text,
  max_marks     numeric(6,2) not null check (max_marks > 0),
  sort_order    integer not null default 0,
  archived_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists exam_component_exam_idx
  on exam_component (exam_id) where archived_at is null;

create table if not exists exam_component_score (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  component_id  uuid not null references exam_component(id) on delete cascade,
  student_id    uuid not null references student(id) on delete cascade,
  -- Null means "not marked yet", which is not the same as zero. A child
  -- who scored nothing has 0; a child nobody has heard has null.
  obtained      numeric(6,2) check (obtained >= 0),
  absent        boolean not null default false,
  recorded_by   uuid,
  updated_at    timestamptz not null default now(),
  unique (component_id, student_id)
);

create index if not exists exam_component_score_student_idx
  on exam_component_score (student_id);

-- Which bands this paper is graded against. The school's Hifz scale is
-- ممتاز / جید جدا / جید / مقبول / راسب; the main school may grade its own
-- subjects differently, so it hangs off the exam rather than the org.
alter table exam add column if not exists grade_scale_id uuid
  references grade_scale(id) on delete set null;

notify pgrst, 'reload schema';
