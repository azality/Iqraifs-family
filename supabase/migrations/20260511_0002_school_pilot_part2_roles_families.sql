-- =============================================================================
-- School Pilot — part 2: enums + user_roles + families + children
-- =============================================================================
-- Idempotent: safe to re-run. All CREATE TYPE statements are wrapped in
-- DO/EXCEPTION blocks; all CREATE TABLE use IF NOT EXISTS.
--
-- Run this in the Supabase SQL Editor AFTER part 1 (which already created
-- organizations, campuses, academic_years).
--
-- After this finishes, run a verify:
--   SELECT 'OK' WHERE
--     EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_roles')
--     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'families')
--     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'children');
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Enums for role_type + role_scope_type (idempotent)
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE role_type AS ENUM ('principal', 'teacher', 'parent', 'student');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE role_scope_type AS ENUM ('organization', 'campus', 'class', 'family', 'child');
EXCEPTION WHEN duplicate_object THEN null;
END $$;


-- -----------------------------------------------------------------------------
-- user_roles — single source of truth for "who can do what"
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_roles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  role_type     role_type NOT NULL,
  scope_type    role_scope_type NOT NULL,
  scope_id      uuid NOT NULL,
  granted_by    uuid,
  granted_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz,
  UNIQUE (user_id, role_type, scope_type, scope_id)
);

CREATE INDEX IF NOT EXISTS user_roles_user
  ON user_roles(user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS user_roles_scope
  ON user_roles(scope_type, scope_id) WHERE revoked_at IS NULL;


-- -----------------------------------------------------------------------------
-- Ensure the updated-at helper exists (in case part 1 dropped it)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- -----------------------------------------------------------------------------
-- families + family_members + children
-- (these mirror what KV stores today; Postgres versions used after cutover)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS families (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  invite_code     text UNIQUE,
  timezone        text NOT NULL DEFAULT 'Asia/Karachi',
  salah_qadha_points    smallint NOT NULL DEFAULT 1,
  salah_missed_points   smallint NOT NULL DEFAULT -1,
  daily_points_cap      smallint NOT NULL DEFAULT 50,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_families_updated ON families;
CREATE TRIGGER trg_families_updated BEFORE UPDATE ON families
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE IF NOT EXISTS children (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name            text NOT NULL,
  pin_hash        text,
  avatar          text,
  date_of_birth   date,
  current_points         integer NOT NULL DEFAULT 0,
  highest_milestone      integer NOT NULL DEFAULT 0,
  daily_points_earned    integer NOT NULL DEFAULT 0,
  daily_points_reset_date date,
  hifz_progress   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_children_updated ON children;
CREATE TRIGGER trg_children_updated BEFORE UPDATE ON children
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS children_family ON children(family_id);


CREATE TABLE IF NOT EXISTS family_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  relationship text NOT NULL DEFAULT 'parent',
  is_owner    boolean NOT NULL DEFAULT false,
  joined_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, user_id)
);


-- -----------------------------------------------------------------------------
-- Verification
-- -----------------------------------------------------------------------------
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_roles')    AS has_user_roles,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'families')      AS has_families,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'children')      AS has_children,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'family_members')AS has_family_members;
