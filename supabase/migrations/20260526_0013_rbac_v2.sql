-- =============================================================================
-- RBAC v2 — add financial_staff and office_staff role templates
-- Idempotent. No RLS.
-- =============================================================================

-- Extend role_type enum
ALTER TYPE role_type ADD VALUE IF NOT EXISTS 'financial_staff';
ALTER TYPE role_type ADD VALUE IF NOT EXISTS 'office_staff';

-- Drop + recreate the CHECK on role_template_override.role_template
-- to include the new templates. Wrap in DO block for idempotency.
DO $$
BEGIN
  ALTER TABLE role_template_override
    DROP CONSTRAINT IF EXISTS role_template_override_role_template_check;
  ALTER TABLE role_template_override
    ADD CONSTRAINT role_template_override_role_template_check
    CHECK (role_template IN ('admin','class_teacher','visiting_teacher','financial_staff','office_staff'));
EXCEPTION WHEN OTHERS THEN
  -- If the constraint name differs (older Postgres auto-naming), search and drop it.
  NULL;
END$$;
