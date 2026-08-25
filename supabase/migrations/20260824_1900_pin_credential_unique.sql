-- Missing unique constraint behind /orgs/:orgId/pin/set.
--
-- The endpoint upserts pin_credential with
--   onConflict: "org_id,subject_type,subject_id"
-- but no unique constraint/index matched that spec, so EVERY call —
-- including a first-time set — failed with Postgres error 42P10
-- ("no unique or exclusion constraint matching the ON CONFLICT
-- specification"). Setting a student/parent PIN from the admin UI has
-- therefore never worked; the demo portal credentials were seeded by
-- direct insert, which masked it. Caught by regression check 17
-- (portal auth) on 2026-08-24.
--
-- Verified zero duplicate (org_id, subject_type, subject_id) rows
-- before creating. Applied live via the temporary nonce-gated endpoint
-- (remote migration history unrecorded; db push unsafe). This file is
-- the committed record.

CREATE UNIQUE INDEX IF NOT EXISTS uq_pin_credential_subject
  ON pin_credential(org_id, subject_type, subject_id);
