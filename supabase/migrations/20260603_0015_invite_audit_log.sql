-- =============================================================================
-- Invite & staff-change audit log
-- =============================================================================
-- Per docs/SCHOOL_ROLES.md gap #11: no way to see who invited whom or when.
-- Critical for trust at pilot — principal needs to be able to say
-- "smyounus added Sara as admin on June 3" without spelunking through logs.
--
-- We write a row on:
--   - admin add / remove (school.delete + schoolPhaseA POST /admins)
--   - teacher add / bulk add / remove
--   - resend-invite
--   - staff self-leave
--   - school soft-delete / restore
--
-- Read endpoint: GET /school/orgs/:orgId/audit — principal/admin only.
-- UI: tab/page rendering the latest 200 entries in reverse chronological.
-- =============================================================================

CREATE TABLE IF NOT EXISTS invite_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email     text,                      -- snapshotted; survives user deletion
  action          text NOT NULL,             -- e.g. 'invite_admin', 'remove_teacher', 'resend_invite'
  target_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_email    text,                      -- snapshotted at action time
  target_role     text,                      -- e.g. 'admin', 'class_teacher'
  details         jsonb DEFAULT '{}'::jsonb, -- free-form (e.g. {sent:false, reason:'…'})
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invite_audit_log_org_time_idx
  ON invite_audit_log (org_id, created_at DESC);

COMMENT ON TABLE invite_audit_log IS
  'Append-only log of staff invite / removal / resend events per org.';
COMMENT ON COLUMN invite_audit_log.actor_email IS
  'Snapshotted at write time so the row is still legible after the user is deleted.';
COMMENT ON COLUMN invite_audit_log.details IS
  'Free-form JSON. Conventions: {invitedCount:0|1}, {sent:bool,reason?:string}, etc.';
