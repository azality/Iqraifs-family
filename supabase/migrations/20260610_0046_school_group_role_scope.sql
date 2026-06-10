-- =============================================================================
-- school_group as a role scope.
-- =============================================================================
-- Why:
--   With school_group in place, the chain principal wants ONE role row
--   that grants principal across all member campuses, not four. Add
--   'school_group' to the role_scope_type enum and the gate helpers in
--   schoolAuth.ts will recognise it.
--
-- A school_group-scoped role with role_type='principal' implicitly
-- grants principal on every organization whose school_group_id matches.
-- =============================================================================

-- Postgres requires ALTER TYPE ADD VALUE to run outside a transaction;
-- migrations run sequentially so this is fine.
ALTER TYPE role_scope_type ADD VALUE IF NOT EXISTS 'school_group';

-- Verify
SELECT
  EXISTS (
    SELECT 1 FROM pg_enum
    JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
    WHERE pg_type.typname = 'role_scope_type'
      AND pg_enum.enumlabel = 'school_group'
  ) AS has_school_group_scope;
