-- hifz_progress.kind — allow the two nazra (reading) kinds.
--
-- v1.0.98 added `nazra` and `nazra_revision` to the application-level
-- whitelist, but the column also carries a CHECK constraint listing the
-- six hifz kinds. The app accepted the new kinds and Postgres then
-- rejected the insert with a 500 — so a nazra teacher's very first
-- "Heard" would have failed. Caught by regression check 45 on the
-- post-deploy run.
--
-- nazra          = a heard reading portion (the child reads, not memorizes)
-- nazra_revision = the same act for a hafiz child sitting in a nazra
--                  group (Class IV+), revising rather than advancing

alter table hifz_progress
  drop constraint if exists hifz_progress_kind_check;

alter table hifz_progress
  add constraint hifz_progress_kind_check
  check (kind = any (array[
    'memorized'::text,
    'revised'::text,
    'tested'::text,
    'sabaq'::text,
    'sabqi'::text,
    'manzil'::text,
    'nazra'::text,
    'nazra_revision'::text
  ]));
