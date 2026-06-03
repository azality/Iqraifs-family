-- =============================================================================
-- Role validity window (PR F, Q5)
-- =============================================================================
-- When the principal/admin invites a visiting teacher, they specify the
-- contract dates (e.g. "this Hifz tutor works June 1 to August 31"). The
-- role row is only effective inside that window — outside it, every scope
-- check fails as if the role doesn't exist.
--
-- Schema:
--   valid_from  - the role becomes effective at/after this UTC date.
--                  NULL → effective immediately (today's behavior).
--   valid_until - the role expires at/after this UTC date (inclusive day).
--                  NULL → no expiry (today's behavior — admins, principals,
--                  permanent staff).
--
-- The is_role_active(row) function gives gates a single call site to check.
-- Switching all 50+ existing gates to use it is gradual; the new
-- requireTeacherOfSection helper already calls it.
-- =============================================================================

ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS valid_from  date,
  ADD COLUMN IF NOT EXISTS valid_until date;

COMMENT ON COLUMN user_roles.valid_from IS
  'Inclusive start date for this role grant. NULL = effective immediately.';
COMMENT ON COLUMN user_roles.valid_until IS
  'Inclusive end date for this role grant. NULL = no expiry. Past this date the role is treated as if revoked.';

-- Helper function — kept in SQL so the same logic is available to RLS
-- policies later if we add them.
CREATE OR REPLACE FUNCTION is_role_active(
  p_revoked_at  timestamptz,
  p_valid_from  date,
  p_valid_until date
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_revoked_at IS NULL
    AND (p_valid_from  IS NULL OR p_valid_from  <= (CURRENT_DATE))
    AND (p_valid_until IS NULL OR p_valid_until >= (CURRENT_DATE));
$$;

COMMENT ON FUNCTION is_role_active IS
  'True if a user_roles row is currently effective: not revoked, within its valid_from/valid_until window.';
