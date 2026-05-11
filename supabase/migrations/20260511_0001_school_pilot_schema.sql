-- =============================================================================
-- School Pilot — initial Postgres schema (Iqra Academy pilot, Aug 2026)
-- =============================================================================
-- This migration introduces the school/teacher/class model on top of the
-- existing family/child model. It does NOT drop or replace KV data — the
-- existing KV-backed family flows keep working. The Edge Function backend
-- will be rewritten in a follow-up migration to read/write Postgres
-- instead of KV, with a compat shim during cutover.
--
-- Scope discipline (per SCHOOL_PILOT_SPEC.md):
--   - Organization → Campus → Class → Enrollment → Child (still owned by Family)
--   - Roles: principal, teacher, parent, student
--   - Hifz tracking: sabaq + sabaq_para + manzil
--   - Mainstream: daily diary, homework, assignments, test scores
--   - Recognition rewards: badges + commendations + privileges
--   - Attendance: per class-day
--
-- Out of scope for this migration:
--   - Multi-school SaaS (single org assumed but schema supports more)
--   - Cross-campus transfers (no enrollment history tables)
--   - Cross-campus teachers (single campus per teacher)
--   - Online exam / submission flows
--   - Fee tracking
--
-- All tables are RLS-disabled in this migration. RLS policies are added in
-- a separate follow-up so the schema can be reviewed in isolation. App-level
-- scoping checks must be the line of defense until RLS lands.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Helpers / common columns
-- -----------------------------------------------------------------------------

-- Standard updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 1. IDENTITY & TENANCY
-- =============================================================================
-- Users live in Supabase Auth (auth.users). We mirror only what we need
-- here. A user can hold multiple roles across multiple scopes — e.g. parent
-- in their family AND teacher in a class. Role rows are the source of truth
-- for what a user can see/do.

-- One physical school chain (Iqra Academy). Schema supports multiple orgs
-- but pilot ships with one row.
CREATE TABLE organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,                      -- e.g. "iqra-academy"
  org_type    text NOT NULL DEFAULT 'school',            -- future: business, mosque
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,        -- behavior catalog, salah policy, reward tiers
  -- Billing / promo flag (school pays; pilot is free):
  plan        text NOT NULL DEFAULT 'pilot',             -- pilot | paid | trial
  trial_ends_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_organizations_updated BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- A campus is a physical location. Iqra Academy has 4. A class belongs to
-- a campus. Keeping this simple (single name + optional address) because
-- the principal said no transfers / no cross-campus teachers.
CREATE TABLE campuses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  address         text,
  timezone        text NOT NULL DEFAULT 'Asia/Karachi',
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);


-- Academic years bound everything that resets annually (rosters, leaderboards,
-- promotion). Pilot ships with one row: "2026-27".
CREATE TABLE academic_years (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,                         -- "2026-27"
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  is_current      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name),
  CHECK (end_date > start_date)
);
-- Partial unique index: at most one is_current per org
CREATE UNIQUE INDEX academic_years_one_current_per_org
  ON academic_years (organization_id) WHERE is_current;


-- The role table — single source of truth for "who can do what."
-- A user can have many rows. role_type defines the privilege set; scope_*
-- defines what the privilege applies to.
--
-- Examples:
--   ('user-123', 'principal', 'organization', '<org-uuid>')   — all of Iqra Academy
--   ('user-456', 'teacher',   'class',        '<class-uuid>') — Grade 3-A only
--   ('user-789', 'parent',    'family',       '<family-uuid>')
--   ('user-999', 'student',   'child',        '<child-uuid>') — only their own record
--
CREATE TYPE role_type AS ENUM ('principal', 'teacher', 'parent', 'student');
CREATE TYPE role_scope_type AS ENUM ('organization', 'campus', 'class', 'family', 'child');

CREATE TABLE user_roles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,                           -- references auth.users(id)
  role_type     role_type NOT NULL,
  scope_type    role_scope_type NOT NULL,
  scope_id      uuid NOT NULL,
  granted_by    uuid,                                    -- auth.users(id) who created it
  granted_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz,                             -- soft-revoke for audit trail
  UNIQUE (user_id, role_type, scope_type, scope_id)
);
CREATE INDEX user_roles_user ON user_roles(user_id) WHERE revoked_at IS NULL;
CREATE INDEX user_roles_scope ON user_roles(scope_type, scope_id) WHERE revoked_at IS NULL;


-- =============================================================================
-- 2. FAMILIES & CHILDREN
-- =============================================================================
-- Families exist today in KV. After backend cutover they will live here.
-- A Child belongs to exactly one Family. The same Child can ALSO be enrolled
-- in a school Class — that linkage is in `enrollments`, not on Child directly,
-- so a child can be "school + family" or "family only."

CREATE TABLE families (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  invite_code     text UNIQUE,
  timezone        text NOT NULL DEFAULT 'Asia/Karachi',
  -- Per-family Salah point overrides (qadha/missed). On-time values live
  -- on each Salah trackable item.
  salah_qadha_points    smallint NOT NULL DEFAULT 1,
  salah_missed_points   smallint NOT NULL DEFAULT -1,
  daily_points_cap      smallint NOT NULL DEFAULT 50,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_families_updated BEFORE UPDATE ON families
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE children (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name            text NOT NULL,
  pin_hash        text,                                   -- bcrypt hash, NULL until set
  avatar          text,
  date_of_birth   date,
  -- Aggregates (denormalized for performance — updated by point_event triggers)
  current_points         integer NOT NULL DEFAULT 0,
  highest_milestone      integer NOT NULL DEFAULT 0,
  daily_points_earned    integer NOT NULL DEFAULT 0,
  daily_points_reset_date date,
  -- Hifz progress snapshot — structured, not free text. Updated by sabaq_logs.
  hifz_progress   jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- e.g. {
  --   "juzCompleted": [1,2,3],
  --   "currentJuz": 4,
  --   "lastSabaq": {"surah": "Al-Baqarah", "ayahStart": 100, "ayahEnd": 110, "date": "2026-08-15"},
  --   "manzilLastCovered": {"1": "2026-08-10", "2": "2026-08-11", ...}
  -- }
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_children_updated BEFORE UPDATE ON children
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX children_family ON children(family_id);


-- Maps a user to a family with their role. Replaces the implicit
-- "parentIds[]" field on the old family record.
CREATE TABLE family_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  relationship text NOT NULL DEFAULT 'parent',           -- parent | guardian | caregiver | teacher | other
  is_owner    boolean NOT NULL DEFAULT false,
  joined_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, user_id)
);


-- =============================================================================
-- 3. CLASSES & ENROLLMENT
-- =============================================================================

CREATE TYPE class_track AS ENUM ('mainstream', 'hifz', 'hybrid');

CREATE TABLE classes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campus_id           uuid NOT NULL REFERENCES campuses(id) ON DELETE RESTRICT,
  academic_year_id    uuid NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  name                text NOT NULL,                     -- e.g. "Grade 3-A"
  grade_level         smallint,                          -- 1..12, null for Hifz-only
  section             text,                              -- "A", "B"
  track               class_track NOT NULL DEFAULT 'mainstream',
  class_teacher_id    uuid,                              -- primary teacher (auth.users); NULL until assigned
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, academic_year_id, name)
);
CREATE INDEX classes_campus ON classes(campus_id);
CREATE INDEX classes_teacher ON classes(class_teacher_id) WHERE class_teacher_id IS NOT NULL;


-- Subjects within a class. For Grade 3-A: Math, English, Urdu, Islamiat, etc.
-- For a Hifz section: Hifz is the only "subject" but we model it for
-- consistency.
CREATE TABLE subjects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id        uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name            text NOT NULL,                         -- Math, English, Urdu, Islamiat, Hifz
  teacher_id      uuid,                                  -- subject teacher (may equal class_teacher_id)
  sort_order      smallint NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, name)
);
CREATE INDEX subjects_teacher ON subjects(teacher_id) WHERE teacher_id IS NOT NULL;


-- Enrollment links a Child to a Class. A Child has at most one ACTIVE
-- enrollment at a time (enforced by partial unique index). Withdrawn
-- enrollments stay for history.
CREATE TABLE enrollments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id        uuid NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  child_id        uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  enrolled_at     timestamptz NOT NULL DEFAULT now(),
  withdrawn_at    timestamptz,                            -- NULL = active
  withdrawn_reason text
);
CREATE UNIQUE INDEX enrollments_one_active_per_child
  ON enrollments(child_id) WHERE withdrawn_at IS NULL;
CREATE INDEX enrollments_class ON enrollments(class_id) WHERE withdrawn_at IS NULL;


-- Qari (Hifz teacher) → Hifz student assignment. Many-to-many because a
-- qari teaches several students, and an advanced student might rotate
-- through qaris. Keep simple in v1.
CREATE TABLE hifz_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id        uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  qari_user_id    uuid NOT NULL,                          -- auth.users(id)
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  UNIQUE (child_id, qari_user_id, assigned_at)
);


-- =============================================================================
-- 4. TRACKABLE ITEMS (behavior + habit catalog)
-- =============================================================================
-- Behavior/habit catalog. Today this is family-scoped in KV. In Postgres it
-- can also be org-scoped (school behavior catalog) and applied to all
-- children in that org. owner_type indicates which.

CREATE TYPE trackable_owner AS ENUM ('family', 'organization');
CREATE TYPE trackable_kind  AS ENUM ('salah', 'habit', 'positive', 'negative');

CREATE TABLE trackable_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type          trackable_owner NOT NULL,
  owner_id            uuid NOT NULL,
  name                text NOT NULL,
  kind                trackable_kind NOT NULL,
  category            text,                              -- 'salah', 'quran', 'general', custom
  points              smallint NOT NULL,
  tier                text,                              -- 'minor' | 'moderate' | 'major' for negatives
  dedupe_window_min   smallint,
  is_singleton        boolean NOT NULL DEFAULT false,
  is_religious        boolean NOT NULL DEFAULT false,
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_trackable_items_updated BEFORE UPDATE ON trackable_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX trackable_items_owner ON trackable_items(owner_type, owner_id) WHERE active;


-- =============================================================================
-- 5. POINT EVENTS — the ledger
-- =============================================================================
-- Every point change goes here. School-source and family-source both write
-- to the same table so the child's ledger is unified.

CREATE TYPE event_source AS ENUM ('home', 'school');
CREATE TYPE event_status AS ENUM ('active', 'voided');
CREATE TYPE salah_state  AS ENUM ('ontime', 'qadha', 'missed');

CREATE TABLE point_events (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id                uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  trackable_item_id       uuid REFERENCES trackable_items(id) ON DELETE SET NULL,
  -- Snapshot of item name at write time so renames/deletes don't break the audit trail.
  item_name_snapshot      text,
  points                  smallint NOT NULL,             -- can be negative
  logged_by               uuid NOT NULL,                  -- auth.users(id)
  logged_by_name_snapshot text,                           -- "Ms. Fatima" frozen at write time

  -- Source attribution — critical for parent UI
  source                  event_source NOT NULL,
  source_org_id           uuid REFERENCES organizations(id) ON DELETE SET NULL,
  source_class_id         uuid REFERENCES classes(id) ON DELETE SET NULL,
  source_subject_id       uuid REFERENCES subjects(id) ON DELETE SET NULL,

  -- Flags & subtypes (mirror the existing PointEvent shape)
  is_adjustment           boolean NOT NULL DEFAULT false,
  is_recovery             boolean NOT NULL DEFAULT false,
  recovery_from_event_id  uuid REFERENCES point_events(id) ON DELETE SET NULL,
  recovery_action         text,                          -- apology | reflection | correction
  recovery_notes          text,
  salah_state             salah_state,
  notes                   text,

  -- Idempotency
  idempotency_key         text,

  -- Audit
  status                  event_status NOT NULL DEFAULT 'active',
  voided_by               uuid,
  voided_at               timestamptz,
  void_reason             text,

  occurred_at             timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),

  UNIQUE (idempotency_key)
);
CREATE INDEX point_events_child_time ON point_events(child_id, occurred_at DESC);
CREATE INDEX point_events_source ON point_events(source, source_org_id, source_class_id);
CREATE INDEX point_events_class_time ON point_events(source_class_id, occurred_at DESC) WHERE source_class_id IS NOT NULL;


-- =============================================================================
-- 6. HIFZ TRACKING — structured logs
-- =============================================================================
-- Sabaq, sabaq-para, and manzil logs are stored separately from point_events
-- so the visualizations (juz bar, manzil due-list) can query them directly
-- without scanning the full ledger. Each log also writes a point_event so
-- the audit trail is unified.

CREATE TABLE sabaq_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id        uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  logged_by       uuid NOT NULL,                          -- qari (auth.users)
  point_event_id  uuid REFERENCES point_events(id) ON DELETE SET NULL,
  -- Location in Quran (school picks input style during onboarding)
  surah_number    smallint,                              -- 1..114
  ayah_start      smallint,
  ayah_end        smallint,
  juz_number      smallint,                              -- alt input style
  page_number     smallint,
  tajweed_rating  smallint CHECK (tajweed_rating BETWEEN 1 AND 5),
  notes           text,
  logged_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sabaq_logs_child_time ON sabaq_logs(child_id, logged_at DESC);


CREATE TABLE sabaq_para_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id        uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  logged_by       uuid NOT NULL,
  point_event_id  uuid REFERENCES point_events(id) ON DELETE SET NULL,
  covers_from_sabaq_id uuid REFERENCES sabaq_logs(id) ON DELETE SET NULL,
  covers_to_sabaq_id   uuid REFERENCES sabaq_logs(id) ON DELETE SET NULL,
  quality_rating  smallint CHECK (quality_rating BETWEEN 1 AND 5),
  notes           text,
  logged_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sabaq_para_logs_child_time ON sabaq_para_logs(child_id, logged_at DESC);


CREATE TABLE manzil_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id        uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  logged_by       uuid NOT NULL,
  point_event_id  uuid REFERENCES point_events(id) ON DELETE SET NULL,
  manzil_number   smallint NOT NULL CHECK (manzil_number BETWEEN 1 AND 7),
  quality_rating  smallint CHECK (quality_rating BETWEEN 1 AND 5),
  notes           text,
  logged_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX manzil_logs_child_time ON manzil_logs(child_id, manzil_number, logged_at DESC);


-- =============================================================================
-- 7. MAINSTREAM SUBJECT TRACKING
-- =============================================================================
-- Container for teacher-populated curriculum. We don't ship default content.
-- A curriculum_item is "we plan to cover X this term." Optional sequence.
CREATE TABLE curriculum_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id      uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  sequence        smallint,
  title           text NOT NULL,
  description     text,
  target_week     smallint,                              -- week of academic year, optional
  created_by      uuid NOT NULL,                          -- auth.users(id)
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX curriculum_items_subject ON curriculum_items(subject_id, sequence);


-- Daily class diary entry — per subject, per date. "Today we covered X."
-- Parents see this; replaces the WhatsApp "what did kid do today" tradition.
CREATE TABLE diary_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id        uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id      uuid REFERENCES subjects(id) ON DELETE SET NULL,
  entry_date      date NOT NULL,
  summary         text NOT NULL,
  curriculum_item_id uuid REFERENCES curriculum_items(id) ON DELETE SET NULL,
  posted_by       uuid NOT NULL,
  posted_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, subject_id, entry_date)
);
CREATE INDEX diary_entries_date ON diary_entries(entry_date DESC, class_id);


-- Homework assigned to the class (not per-student — every student gets the
-- same homework). Per-student done/not is in homework_submissions below.
CREATE TABLE homework (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id        uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id      uuid REFERENCES subjects(id) ON DELETE SET NULL,
  title           text NOT NULL,
  description     text,
  attachment_url  text,                                  -- photo of the worksheet, optional
  due_date        date NOT NULL,
  posted_by       uuid NOT NULL,
  posted_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX homework_class_due ON homework(class_id, due_date);


-- Per-student homework completion. Marked by student/parent; confirmed by teacher.
CREATE TABLE homework_submissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id         uuid NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
  child_id            uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'pending',   -- pending | done | confirmed | missed
  marked_by_user_id   uuid,
  marked_at           timestamptz,
  teacher_confirmed_by uuid,
  teacher_confirmed_at timestamptz,
  notes               text,
  UNIQUE (homework_id, child_id)
);
CREATE INDEX homework_submissions_child ON homework_submissions(child_id, status);


-- Assignments are bigger than homework; live on the term report.
CREATE TABLE assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id        uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id      uuid REFERENCES subjects(id) ON DELETE SET NULL,
  title           text NOT NULL,
  description     text,
  max_score       smallint NOT NULL DEFAULT 100,
  due_date        date,
  posted_by       uuid NOT NULL,
  posted_at       timestamptz NOT NULL DEFAULT now()
);


-- Individual test/quiz/assignment scores. One row per child per scored thing.
CREATE TABLE test_scores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id        uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  assignment_id   uuid REFERENCES assignments(id) ON DELETE SET NULL,
  subject_id      uuid REFERENCES subjects(id) ON DELETE SET NULL,
  test_name       text NOT NULL,
  score           numeric(6,2) NOT NULL,
  max_score       numeric(6,2) NOT NULL,
  recorded_by     uuid NOT NULL,
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  notes           text
);
CREATE INDEX test_scores_child ON test_scores(child_id, recorded_at DESC);


-- =============================================================================
-- 8. ATTENDANCE
-- =============================================================================
CREATE TYPE attendance_status AS ENUM ('present', 'late', 'absent', 'present_remote');

CREATE TABLE attendance (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id        uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  class_id        uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  status          attendance_status NOT NULL,
  late_minutes    smallint,
  reason          text,                                  -- required for absent
  recorded_by     uuid NOT NULL,
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (child_id, attendance_date)
);
CREATE INDEX attendance_class_date ON attendance(class_id, attendance_date);


-- =============================================================================
-- 9. RECOGNITION & REWARDS (school side)
-- =============================================================================
-- Family-side rewards/wishlist live in their own tables (not yet migrated)
-- and remain unchanged. School side is recognition only.

-- Badges — auto or manual award. Criteria is JSONB so we can add types
-- without schema changes.
CREATE TABLE badges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  icon            text,                                  -- emoji or asset key
  criteria_type   text NOT NULL,                         -- 'manual' | 'hifz_juz' | 'streak' | 'attendance' | 'custom'
  criteria        jsonb NOT NULL DEFAULT '{}'::jsonb,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);


CREATE TABLE badge_awards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id        uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  badge_id        uuid NOT NULL REFERENCES badges(id) ON DELETE RESTRICT,
  awarded_by      uuid NOT NULL,                          -- auth.users(id) or system (NULL for auto?)
  awarded_at      timestamptz NOT NULL DEFAULT now(),
  citation        text,
  UNIQUE (child_id, badge_id, awarded_at)                 -- allow re-earn but not duplicate same instant
);
CREATE INDEX badge_awards_child ON badge_awards(child_id, awarded_at DESC);


-- Free-form commendations from teacher/principal. Generate the PDF letter
-- in app, not schema.
CREATE TABLE commendations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id        uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  issued_by       uuid NOT NULL,
  issued_role     role_type NOT NULL,                     -- 'teacher' | 'principal'
  title           text NOT NULL,
  body            text NOT NULL,
  signed_off      boolean NOT NULL DEFAULT false,        -- principal countersign for letter
  issued_at       timestamptz NOT NULL DEFAULT now()
);


-- Catalog of class privileges the school recognizes.
CREATE TABLE class_privileges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,                          -- "Lead the dua"
  description     text,
  active          boolean NOT NULL DEFAULT true,
  UNIQUE (organization_id, name)
);


CREATE TABLE privilege_grants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id        uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  privilege_id    uuid NOT NULL REFERENCES class_privileges(id) ON DELETE RESTRICT,
  granted_by      uuid NOT NULL,
  granted_at      timestamptz NOT NULL DEFAULT now(),
  used_at         timestamptz,
  notes           text
);


-- =============================================================================
-- 10. PARENT INVITES, NOTES, COMMENTS
-- =============================================================================
-- Parent invite codes (one-off, single-use) generated during bulk student import.
CREATE TABLE parent_invites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code     text NOT NULL UNIQUE,
  child_id        uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz,
  consumed_by     uuid,                                   -- auth.users(id) of accepting parent
  consumed_at     timestamptz
);


-- Parent comment on a school entry (point event, diary, homework, etc.)
-- Teacher gets notified. Parent CANNOT edit school entries.
CREATE TABLE parent_comments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id        uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  target_type     text NOT NULL,                          -- 'point_event' | 'diary_entry' | 'homework' | 'test_score'
  target_id       uuid NOT NULL,
  body            text NOT NULL,
  posted_by       uuid NOT NULL,
  posted_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  resolved_by     uuid
);
CREATE INDEX parent_comments_target ON parent_comments(target_type, target_id);


-- =============================================================================
-- 11. NOTIFICATIONS
-- =============================================================================
-- Device tokens for push. Decoupled from user so a user with multiple
-- devices is supported.
CREATE TABLE push_devices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  platform        text NOT NULL,                          -- 'web' | 'ios' | 'android'
  token           text NOT NULL,
  active          boolean NOT NULL DEFAULT true,
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);


-- =============================================================================
-- 12. SEED — pilot organization
-- =============================================================================
-- The principal will be created via Supabase Auth; this just lays down the
-- org + academic year so they can sign in and start onboarding.
-- This INSERT is idempotent because slug is unique.

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

-- Note: academic year, campuses, classes, subjects are created via the
-- onboarding UI by the principal/head teachers, not seeded here.


-- =============================================================================
-- 13. STATE NOT YET IN THIS MIGRATION (documented so reviewers don't think
-- it was forgotten)
-- =============================================================================
-- Deferred / explicit follow-ups:
--   - RLS policies for every table (separate migration)
--   - Postgres functions to enforce daily-cap, singleton, milestone-floor on
--     point_event inserts (currently in the Edge Function; will move)
--   - Triggers to maintain children.current_points / hifz_progress denormals
--   - Materialized view for class leaderboards (weekly snapshot, refreshed
--     nightly)
--   - View `child_full_history` joining point_events + sabaq_logs + diary
--     entries + test_scores + attendance for the parent timeline
--   - Migration script: existing KV family/child/event data → Postgres
--   - Audit-log table for sensitive admin actions (teacher role grants,
--     student withdrawals)
--   - Reward "class budget" wallet table (only if principal asks for it)
--   - Term/semester table for grouping assignments + report cards
