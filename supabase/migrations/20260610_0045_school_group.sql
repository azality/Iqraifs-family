-- =============================================================================
-- school_group — multi-campus container.
-- =============================================================================
-- Why:
--   Iqra Academy runs 4 campuses. Today each campus is a separate
--   `organizations` row, fully isolated. The principal of the chain
--   needs a cross-campus view ("total students across all four", "fees
--   collected this month chain-wide"); parents of children at two
--   campuses want one login, not two.
--
-- This PR adds the foundation:
--   1. school_group table (id, name, slug)
--   2. organizations.school_group_id nullable FK — orgs not in a group
--      behave exactly as before; orgs sharing a group_id become
--      siblings.
--   3. parent.school_group_id nullable — when set, this parent record
--      is shared across every org in the group. PIN auth still goes
--      through one org's slug; the parent's data follows.
--
-- Out of scope for this PR (separate follow-ups):
--   - Transfer-student endpoint (moves child between sibling orgs)
--   - Cross-group permissions in user_roles (today a chain principal
--     would need a role row per org; adding scope_type='school_group'
--     is the right shape)
--
-- Existing single-school orgs keep working: school_group_id stays null
-- and every existing query continues to scope by org_id.
-- =============================================================================

CREATE TABLE IF NOT EXISTS school_group (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  slug            text NOT NULL UNIQUE,
  -- Settings hold chain-wide preferences: shared branding override,
  -- consolidated billing toggle, etc. Free-form for now.
  settings        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS school_group_id uuid REFERENCES school_group(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS organizations_school_group
  ON organizations(school_group_id)
  WHERE school_group_id IS NOT NULL;

ALTER TABLE parent
  ADD COLUMN IF NOT EXISTS school_group_id uuid REFERENCES school_group(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS parent_school_group
  ON parent(school_group_id)
  WHERE school_group_id IS NOT NULL;

-- Verify
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'school_group') AS has_school_group,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'school_group_id') AS orgs_has_group,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parent' AND column_name = 'school_group_id') AS parent_has_group;
