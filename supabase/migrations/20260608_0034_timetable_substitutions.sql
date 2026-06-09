-- Timetable substitutions — one-off (per-date) coverage of a slot by a
-- different teacher. Multi-day / recurring subs are intentionally out of
-- scope; if a teacher is out for a week, create N rows for N dates.
--
-- One sub per (entry, date) — enforced by UNIQUE. To change the sub,
-- DELETE + INSERT (no UPDATE path needed — the reason is the only soft
-- field).
--
-- All FKs use ON DELETE CASCADE on entry/org so cleanup is automatic
-- when an entry is archived or an org is hard-deleted.

CREATE TABLE IF NOT EXISTS public.timetable_substitution (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      uuid NOT NULL REFERENCES public.org(id) ON DELETE CASCADE,
  entry_id                    uuid NOT NULL REFERENCES public.timetable_entry(id) ON DELETE CASCADE,
  date                        date NOT NULL,
  substitute_teacher_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason                      text,
  created_by                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_id, date)
);

CREATE INDEX IF NOT EXISTS idx_tt_sub_org_date
  ON public.timetable_substitution (org_id, date);

CREATE INDEX IF NOT EXISTS idx_tt_sub_substitute_date
  ON public.timetable_substitution (substitute_teacher_user_id, date);
