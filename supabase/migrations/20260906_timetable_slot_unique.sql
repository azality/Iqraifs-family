-- One bell schedule cannot ring two periods at the same minute on the
-- same day. Nothing enforced that, and apply-template exploited the gap:
-- it deleted only the EMPTY slots of the default band, then re-inserted
-- the whole grid unconditionally, so every slot that had a timetable in
-- it gained an identical empty twin. Pressing Save twice on the School
-- Schedule page was enough (pilot, 6 Sep).
--
-- The generator is fixed in the same release; this is the backstop, so
-- no future writer can reintroduce the duplicates.

-- ── 1. Clear the duplicates that already exist ───────────────────────
-- Only the QA sandbox band has any (its scaffolding re-inserted "QA P1"
-- each suite run). Keep the row that carries real timetable entries —
-- archiving one with entries attached would orphan them — falling back
-- to the oldest. Archive rather than delete: a slot id may be referenced
-- from somewhere we would rather not break, and archived_at is already
-- how this table retires a period.
with ranked as (
  select
    s.id,
    row_number() over (
      partition by s.org_id, s.schedule_key, s.day_of_week, s.start_time
      order by
        (select count(*) from timetable_entry e where e.slot_id = s.id) desc,
        s.created_at asc,
        s.id asc
    ) as rn
  from timetable_slot s
  where s.archived_at is null
)
update timetable_slot t
   set archived_at = now()
  from ranked r
 where t.id = r.id
   and r.rn > 1;

-- ── 2. Make it impossible from now on ────────────────────────────────
-- Partial, so retiring a period and recreating it at the same time still
-- works. schedule_key is part of the key: the junior and senior wings
-- legitimately ring their own 08:30.
create unique index if not exists timetable_slot_unique_period
  on timetable_slot (org_id, schedule_key, day_of_week, start_time)
  where archived_at is null;
