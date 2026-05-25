-- =============================================================================
-- School Pilot — Phase C.3 + Phase D schema
-- Curriculum (per-section yearly), Fees (per-student per-period), Forms (native
-- form builder with fields, responses, response values).
--
-- Idempotent. No RLS. Service-role + app-level scope checks only.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. curriculum — per-section yearly curriculum
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS curriculum (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  class_section_id    uuid NOT NULL REFERENCES class_section(id) ON DELETE CASCADE,
  academic_year       text NOT NULL,
  title               text NOT NULL,
  description         text,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_section_id, academic_year)
);
CREATE INDEX IF NOT EXISTS curriculum_org_year
  ON curriculum(org_id, academic_year);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_curriculum_updated'
  ) THEN
    CREATE TRIGGER trg_curriculum_updated BEFORE UPDATE ON curriculum
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;


-- -----------------------------------------------------------------------------
-- 2. curriculum_topic
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS curriculum_topic (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_id   uuid NOT NULL REFERENCES curriculum(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  display_order   int  NOT NULL DEFAULT 0,
  target_date     date,
  completed       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS curriculum_topic_order
  ON curriculum_topic(curriculum_id, display_order);


-- -----------------------------------------------------------------------------
-- 3. fee_status — per-student per-period
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fee_status (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  period          text NOT NULL,
  amount_due      numeric(10,2),
  amount_paid     numeric(10,2) DEFAULT 0,
  status          text NOT NULL DEFAULT 'unpaid'
                    CHECK (status IN ('unpaid','paid','partial','waived')),
  due_date        date,
  paid_date       date,
  receipt_url     text,
  notes           text,
  recorded_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, period)
);
CREATE INDEX IF NOT EXISTS fee_status_org_period_status
  ON fee_status(org_id, period, status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_fee_status_updated'
  ) THEN
    CREATE TRIGGER trg_fee_status_updated BEFORE UPDATE ON fee_status
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;


-- -----------------------------------------------------------------------------
-- 4. form — native form builder
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS form (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title                 text NOT NULL,
  description           text,
  audience_kind         text NOT NULL
                          CHECK (audience_kind IN ('whole_school','class_section','specific_students')),
  audience_section_id   uuid REFERENCES class_section(id) ON DELETE CASCADE,
  audience_student_ids  uuid[],
  status                text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','published','closed')),
  allow_multiple        boolean NOT NULL DEFAULT false,
  deadline              timestamptz,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS form_org_status ON form(org_id, status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_form_updated'
  ) THEN
    CREATE TRIGGER trg_form_updated BEFORE UPDATE ON form
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;


-- -----------------------------------------------------------------------------
-- 5. form_field
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS form_field (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id         uuid NOT NULL REFERENCES form(id) ON DELETE CASCADE,
  display_order   int  NOT NULL DEFAULT 0,
  kind            text NOT NULL
                    CHECK (kind IN ('short_text','long_text','single_select','multi_select','number')),
  label           text NOT NULL,
  required        boolean NOT NULL DEFAULT false,
  options         jsonb DEFAULT '[]'::jsonb,
  help_text       text
);
CREATE INDEX IF NOT EXISTS form_field_order
  ON form_field(form_id, display_order);


-- -----------------------------------------------------------------------------
-- 6. form_response
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS form_response (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id                 uuid NOT NULL REFERENCES form(id) ON DELETE CASCADE,
  submitter_user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitter_parent_id     uuid REFERENCES parent(id) ON DELETE SET NULL,
  on_behalf_of_student_id uuid REFERENCES student(id) ON DELETE SET NULL,
  submitted_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (submitter_user_id IS NOT NULL OR submitter_parent_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS form_response_form_submitted
  ON form_response(form_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS form_response_parent
  ON form_response(submitter_parent_id);
CREATE INDEX IF NOT EXISTS form_response_user
  ON form_response(submitter_user_id);


-- -----------------------------------------------------------------------------
-- 7. form_response_value
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS form_response_value (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id     uuid NOT NULL REFERENCES form_response(id) ON DELETE CASCADE,
  field_id        uuid NOT NULL REFERENCES form_field(id) ON DELETE CASCADE,
  value_text      text,
  value_number    numeric,
  value_multi     jsonb,
  UNIQUE (response_id, field_id)
);


-- =============================================================================
-- End of Phase C.3 + D schema.
-- =============================================================================
