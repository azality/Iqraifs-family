-- exam.name_en (23 Sep 2026).
--
-- The Hifz half-yearly was created with one bilingual name -
-- "ششماہی امتحان — Half-yearly (Hifz)" - so the Urdu showed even in
-- the English UI ("why does it say ششماہی امتحان even when you're in
-- english"). Its COMPONENTS already carry name/name_en and follow the
-- reader's language (v1.2.5); the exam's own name now does the same.
-- name = the school's primary (Urdu) name; name_en = the English one;
-- either may be null and readers fall back to the other.
--
-- Idempotent: safe to re-run.

ALTER TABLE exam ADD COLUMN IF NOT EXISTS name_en text;
