-- Class type: the productized answer to "how does the system know this
-- is a Hifz class?" — previously inferred from schedule_key data only
-- the developer could author. Schools now choose the type at class
-- creation (Add Class dialog); it drives the template: academic =
-- subjects/curriculum/coverage, hifz = per-child recitation log + Hifz
-- program membership + recitation-first section page.
--
-- Applied live 2026-08-28 via the temporary nonce-gated endpoint; this
-- file is the committed record. Backfill marked every class having a
-- section on the 'hifz' bell schedule (IFS: Hifz I–IV).

ALTER TABLE class
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'academic';

UPDATE class SET kind = 'hifz'
 WHERE id IN (SELECT DISTINCT class_id FROM class_section WHERE schedule_key = 'hifz');
