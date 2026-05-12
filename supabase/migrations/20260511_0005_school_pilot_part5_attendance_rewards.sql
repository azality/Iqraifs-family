-- =============================================================================
-- School Pilot — part 5: attendance + recognition (badges/commendations/
--                          privileges) + parent invites/comments + push devices
-- =============================================================================
-- Idempotent. Run AFTER parts 1-4.
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE attendance_status AS ENUM ('present', 'late', 'absent', 'present_remote');
EXCEPTION WHEN duplicate_object THEN null;
END $$;


CREATE TABLE IF NOT EXISTS attendance (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id        uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  class_id        uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  status          attendance_status NOT NULL,
  late_minutes    smallint,
  reason          text,
  recorded_by     uuid NOT NULL,
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (child_id, attendance_date)
);
CREATE INDEX IF NOT EXISTS attendance_class_date ON attendance(class_id, attendance_date);


-- Recognition: badges, commendations, privileges (school-side, no consumer rewards)
CREATE TABLE IF NOT EXISTS badges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  icon            text,
  criteria_type   text NOT NULL,
  criteria        jsonb NOT NULL DEFAULT '{}'::jsonb,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);


CREATE TABLE IF NOT EXISTS badge_awards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id        uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  badge_id        uuid NOT NULL REFERENCES badges(id) ON DELETE RESTRICT,
  awarded_by      uuid NOT NULL,
  awarded_at      timestamptz NOT NULL DEFAULT now(),
  citation        text,
  UNIQUE (child_id, badge_id, awarded_at)
);
CREATE INDEX IF NOT EXISTS badge_awards_child ON badge_awards(child_id, awarded_at DESC);


CREATE TABLE IF NOT EXISTS commendations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id        uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  issued_by       uuid NOT NULL,
  issued_role     role_type NOT NULL,
  title           text NOT NULL,
  body            text NOT NULL,
  signed_off      boolean NOT NULL DEFAULT false,
  issued_at       timestamptz NOT NULL DEFAULT now()
);


CREATE TABLE IF NOT EXISTS class_privileges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  active          boolean NOT NULL DEFAULT true,
  UNIQUE (organization_id, name)
);


CREATE TABLE IF NOT EXISTS privilege_grants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id        uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  privilege_id    uuid NOT NULL REFERENCES class_privileges(id) ON DELETE RESTRICT,
  granted_by      uuid NOT NULL,
  granted_at      timestamptz NOT NULL DEFAULT now(),
  used_at         timestamptz,
  notes           text
);


-- Parent invites, comments, push devices
CREATE TABLE IF NOT EXISTS parent_invites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code     text NOT NULL UNIQUE,
  child_id        uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz,
  consumed_by     uuid,
  consumed_at     timestamptz
);


CREATE TABLE IF NOT EXISTS parent_comments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id        uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  target_type     text NOT NULL,
  target_id       uuid NOT NULL,
  body            text NOT NULL,
  posted_by       uuid NOT NULL,
  posted_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  resolved_by     uuid
);
CREATE INDEX IF NOT EXISTS parent_comments_target
  ON parent_comments(target_type, target_id);


CREATE TABLE IF NOT EXISTS push_devices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  platform        text NOT NULL,
  token           text NOT NULL,
  active          boolean NOT NULL DEFAULT true,
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);


-- Seed the organization row if it's missing (the part-1 seed may not have run)
INSERT INTO organizations (name, slug, org_type, plan, settings) VALUES (
  'Iqra Academy',
  'iqra-academy',
  'school',
  'pilot',
  jsonb_build_object(
    'salahQadhaPoints', 1,
    'salahMissedPoints', -1,
    'leaderboardFrequency', 'weekly',
    'dailyDiaryDelivery', 'daily',
    'allowParentComments', true
  )
) ON CONFLICT (slug) DO NOTHING;


-- Final verification — confirm every school-side table exists
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name IN (
    'organizations','campuses','academic_years','user_roles',
    'families','family_members','children',
    'classes','subjects','enrollments','hifz_assignments',
    'trackable_items','point_events',
    'sabaq_logs','sabaq_para_logs','manzil_logs',
    'curriculum_items','diary_entries','homework','homework_submissions',
    'assignments','test_scores','attendance',
    'badges','badge_awards','commendations','class_privileges','privilege_grants',
    'parent_invites','parent_comments','push_devices'
  )) AS tables_present,
  30 AS tables_expected;
