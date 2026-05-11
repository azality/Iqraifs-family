-- =============================================================================
-- School Pilot — part 3: classes + enrollments + trackable items + point_events
-- =============================================================================
-- Idempotent. Run AFTER parts 1 and 2.
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE class_track AS ENUM ('mainstream', 'hifz', 'hybrid');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE trackable_owner AS ENUM ('family', 'organization');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE trackable_kind AS ENUM ('salah', 'habit', 'positive', 'negative');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE event_source AS ENUM ('home', 'school');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE event_status AS ENUM ('active', 'voided');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE salah_state AS ENUM ('ontime', 'qadha', 'missed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;


-- -----------------------------------------------------------------------------
-- classes, subjects, enrollments, hifz_assignments
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS classes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campus_id           uuid NOT NULL REFERENCES campuses(id) ON DELETE RESTRICT,
  academic_year_id    uuid NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  name                text NOT NULL,
  grade_level         smallint,
  section             text,
  track               class_track NOT NULL DEFAULT 'mainstream',
  class_teacher_id    uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, academic_year_id, name)
);
CREATE INDEX IF NOT EXISTS classes_campus ON classes(campus_id);
CREATE INDEX IF NOT EXISTS classes_teacher ON classes(class_teacher_id) WHERE class_teacher_id IS NOT NULL;


CREATE TABLE IF NOT EXISTS subjects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id        uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name            text NOT NULL,
  teacher_id      uuid,
  sort_order      smallint NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, name)
);
CREATE INDEX IF NOT EXISTS subjects_teacher ON subjects(teacher_id) WHERE teacher_id IS NOT NULL;


CREATE TABLE IF NOT EXISTS enrollments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id        uuid NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  child_id        uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  enrolled_at     timestamptz NOT NULL DEFAULT now(),
  withdrawn_at    timestamptz,
  withdrawn_reason text
);
CREATE UNIQUE INDEX IF NOT EXISTS enrollments_one_active_per_child
  ON enrollments(child_id) WHERE withdrawn_at IS NULL;
CREATE INDEX IF NOT EXISTS enrollments_class ON enrollments(class_id) WHERE withdrawn_at IS NULL;


CREATE TABLE IF NOT EXISTS hifz_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id        uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  qari_user_id    uuid NOT NULL,
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  UNIQUE (child_id, qari_user_id, assigned_at)
);


-- -----------------------------------------------------------------------------
-- trackable_items + point_events (the ledger)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trackable_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type          trackable_owner NOT NULL,
  owner_id            uuid NOT NULL,
  name                text NOT NULL,
  kind                trackable_kind NOT NULL,
  category            text,
  points              smallint NOT NULL,
  tier                text,
  dedupe_window_min   smallint,
  is_singleton        boolean NOT NULL DEFAULT false,
  is_religious        boolean NOT NULL DEFAULT false,
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_trackable_items_updated ON trackable_items;
CREATE TRIGGER trg_trackable_items_updated BEFORE UPDATE ON trackable_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS trackable_items_owner
  ON trackable_items(owner_type, owner_id) WHERE active;


CREATE TABLE IF NOT EXISTS point_events (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id                uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  trackable_item_id       uuid REFERENCES trackable_items(id) ON DELETE SET NULL,
  item_name_snapshot      text,
  points                  smallint NOT NULL,
  logged_by               uuid NOT NULL,
  logged_by_name_snapshot text,
  source                  event_source NOT NULL,
  source_org_id           uuid REFERENCES organizations(id) ON DELETE SET NULL,
  source_class_id         uuid REFERENCES classes(id) ON DELETE SET NULL,
  source_subject_id       uuid REFERENCES subjects(id) ON DELETE SET NULL,
  is_adjustment           boolean NOT NULL DEFAULT false,
  is_recovery             boolean NOT NULL DEFAULT false,
  recovery_from_event_id  uuid REFERENCES point_events(id) ON DELETE SET NULL,
  recovery_action         text,
  recovery_notes          text,
  salah_state             salah_state,
  notes                   text,
  idempotency_key         text,
  status                  event_status NOT NULL DEFAULT 'active',
  voided_by               uuid,
  voided_at               timestamptz,
  void_reason             text,
  occurred_at             timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);
CREATE INDEX IF NOT EXISTS point_events_child_time
  ON point_events(child_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS point_events_source
  ON point_events(source, source_org_id, source_class_id);
CREATE INDEX IF NOT EXISTS point_events_class_time
  ON point_events(source_class_id, occurred_at DESC) WHERE source_class_id IS NOT NULL;


SELECT
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'classes')          AS has_classes,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subjects')         AS has_subjects,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'enrollments')      AS has_enrollments,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'trackable_items')  AS has_trackable_items,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'point_events')     AS has_point_events;
