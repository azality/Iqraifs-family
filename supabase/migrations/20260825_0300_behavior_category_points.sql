-- School-set point values per behavior category.
--
-- Behavior points were previously free-form per teacher, which makes the
-- leaderboard/behavior score a measure of which teacher a child got
-- rather than of the child. The school now sets a magnitude per category
-- (positive award + concern deduction); the note-write endpoint enforces
-- it for teachers (admin/principal may override) and clamps "Other"
-- free-text entries to +/-3.
--
-- Applied live 2026-08-25 via the temporary nonce-gated endpoint; this
-- file is the committed record. IFS values seeded separately (Adab +1/-1,
-- Salah punctuality +2/-1, Honesty +3, Behaviour toward peers -2, etc.)
-- pending Ambreen's confirmation.

ALTER TABLE behavior_category
  ADD COLUMN IF NOT EXISTS points_positive int NOT NULL DEFAULT 1;
ALTER TABLE behavior_category
  ADD COLUMN IF NOT EXISTS points_concern int NOT NULL DEFAULT 1;
