-- =============================================================================
-- Org soft-delete + 30-day grace period
-- =============================================================================
-- Per docs/SCHOOL_ROLES.md gap #4: only principals can delete the school, and
-- deletion is a soft-flag with a 30-day grace window so a misclick (or a
-- disgruntled principal acting in haste) doesn't immediately nuke teachers'
-- and parents' workspaces.
--
-- States:
--   deleted_at = NULL              → active org
--   deleted_at = <ts>              → soft-deleted, in grace window
--   purge_after < now()            → eligible for hard-delete by background job
--
-- Reads everywhere should filter `deleted_at IS NULL` to make soft-deleted
-- orgs invisible. The background purge job is OUT OF SCOPE for this PR — for
-- the pilot we'll manually hard-delete on Day 31, which is fine for 4 schools.
-- =============================================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS deleted_at  timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purge_after timestamptz;

-- Index so the workspace-switcher query (`WHERE deleted_at IS NULL`) stays
-- fast even when we accumulate purged rows.
CREATE INDEX IF NOT EXISTS organizations_active_idx
  ON organizations (id) WHERE deleted_at IS NULL;

COMMENT ON COLUMN organizations.deleted_at IS
  'Soft-delete marker. NULL = active. Set by DELETE /school/orgs/:orgId.';
COMMENT ON COLUMN organizations.deleted_by IS
  'auth.users.id of the principal who initiated the delete.';
COMMENT ON COLUMN organizations.purge_after IS
  'Hard-delete eligibility timestamp. Set to deleted_at + 30 days at soft-delete time.';
