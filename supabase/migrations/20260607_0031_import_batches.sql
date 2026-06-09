-- =============================================================================
-- School Pilot — Import batches + rollback.
--
-- Phase 3 of the Import Center (PR feat/import-rollback). Adds the
-- audit + undo facility the import-strengthening spec asked for. Every
-- bulk endpoint now creates a row in `import_batch` and tags every
-- inserted record with `import_batch_id`; the rollback endpoint then
-- deletes everything attached to a batch in one shot.
--
-- Two pieces:
--
-- 1. `import_batch` — one row per upload. Carries the entity type,
--    who uploaded, how many rows landed, whether/when it was rolled
--    back, and an optional notes field.
--
-- 2. `import_batch_id` columns on every table that bulk endpoints
--    insert into. Nullable + FK ON DELETE SET NULL so manual deletes
--    of an old batch don't break referential integrity (the rollback
--    flow itself goes the other direction: delete rows BY batch_id,
--    then mark batch rolled_back).
--
-- Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS import_batch (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type         text NOT NULL,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  row_count           int  NOT NULL DEFAULT 0,
  rolled_back_at      timestamptz,
  rolled_back_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE import_batch DROP CONSTRAINT IF EXISTS import_batch_entity_check;
ALTER TABLE import_batch
  ADD CONSTRAINT import_batch_entity_check
  CHECK (entity_type IN (
    'classes',
    'sections',
    'subjects',
    'students',
    'parents',
    'teachers',
    'hifz',
    'fees',
    'attendance'
  ));

CREATE INDEX IF NOT EXISTS import_batch_org_created
  ON import_batch(org_id, created_at DESC);

-- Tag every entity table the bulk endpoints write to. ON DELETE SET
-- NULL so an admin can wipe an old import_batch row without nuking
-- the records it once tagged (we want rollback to be explicit, not a
-- side-effect of cleaning up the audit log).
ALTER TABLE class            ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES import_batch(id) ON DELETE SET NULL;
ALTER TABLE class_section    ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES import_batch(id) ON DELETE SET NULL;
ALTER TABLE class_subject    ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES import_batch(id) ON DELETE SET NULL;
ALTER TABLE student          ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES import_batch(id) ON DELETE SET NULL;
ALTER TABLE parent           ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES import_batch(id) ON DELETE SET NULL;
ALTER TABLE student_parent   ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES import_batch(id) ON DELETE SET NULL;
ALTER TABLE hifz_progress    ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES import_batch(id) ON DELETE SET NULL;
ALTER TABLE fee_status       ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES import_batch(id) ON DELETE SET NULL;
ALTER TABLE school_attendance ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES import_batch(id) ON DELETE SET NULL;
ALTER TABLE user_roles       ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES import_batch(id) ON DELETE SET NULL;

-- Partial indexes — only batch-tagged rows matter for the rollback
-- DELETE WHERE import_batch_id = X queries. Saves index space on the
-- vast majority of rows that came in via the single-create flow.
CREATE INDEX IF NOT EXISTS class_import_batch
  ON class(import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS class_section_import_batch
  ON class_section(import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS class_subject_import_batch
  ON class_subject(import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS student_import_batch
  ON student(import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS parent_import_batch
  ON parent(import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS student_parent_import_batch
  ON student_parent(import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS hifz_progress_import_batch
  ON hifz_progress(import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fee_status_import_batch
  ON fee_status(import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS school_attendance_import_batch
  ON school_attendance(import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS user_roles_import_batch
  ON user_roles(import_batch_id) WHERE import_batch_id IS NOT NULL;
