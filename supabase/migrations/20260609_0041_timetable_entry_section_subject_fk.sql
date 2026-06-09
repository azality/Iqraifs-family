-- Fix timetable_entry.section_subject_id FK target.
--
-- The original 0033 migration declared:
--   section_subject_id uuid REFERENCES class_subject(id)
--
-- That mismatched the column NAME (suggests section_subject), the
-- pattern used by lesson + assignment (also FK to section_subject),
-- AND every PostgREST embedding string in the backend
-- (`section_subject:section_subject_id(class_subject:class_subject_id(name))`
-- — which assumes the FK lands on section_subject, then traverses to
-- class_subject from there).
--
-- The schema-cache mismatch was visible in the admin Substitutions
-- panel:
--   "Could not find a relationship between 'class_subject' and
--    'class_subject_id' in the schema cache"
-- and surfaced as an empty section editor grid even though the seed
-- inserted 100 rows.
--
-- This migration:
--   1. Drops the wrong FK
--   2. NULLs every existing section_subject_id value — the seed
--      workaround was passing class_subject ids there, so they're
--      not valid section_subject ids and would FK-violate on re-add.
--      Production data created via the admin UI is similarly bogus.
--      Operators re-fill via the admin → timetable editor.
--   3. Re-adds the FK targeting section_subject(id) ON DELETE SET NULL,
--      matching lesson + assignment.

ALTER TABLE public.timetable_entry
  DROP CONSTRAINT IF EXISTS timetable_entry_section_subject_id_fkey;

UPDATE public.timetable_entry SET section_subject_id = NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'timetable_entry'
      AND constraint_name = 'timetable_entry_section_subject_id_fkey'
  ) THEN
    ALTER TABLE public.timetable_entry
      ADD CONSTRAINT timetable_entry_section_subject_id_fkey
        FOREIGN KEY (section_subject_id)
        REFERENCES public.section_subject(id)
        ON DELETE SET NULL;
  END IF;
END$$;
