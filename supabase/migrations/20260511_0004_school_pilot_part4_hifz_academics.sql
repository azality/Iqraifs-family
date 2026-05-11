-- =============================================================================
-- School Pilot — part 4: Hifz logs + mainstream academics (diary, homework,
--                          assignments, test_scores) + curriculum
-- =============================================================================
-- Idempotent. Run AFTER parts 1, 2, 3.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Hifz: sabaq + sabaq_para + manzil
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sabaq_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id        uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  logged_by       uuid NOT NULL,
  point_event_id  uuid REFERENCES point_events(id) ON DELETE SET NULL,
  surah_number    smallint,
  ayah_start      smallint,
  ayah_end        smallint,
  juz_number      smallint,
  page_number     smallint,
  tajweed_rating  smallint CHECK (tajweed_rating BETWEEN 1 AND 5),
  notes           text,
  logged_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sabaq_logs_child_time ON sabaq_logs(child_id, logged_at DESC);


CREATE TABLE IF NOT EXISTS sabaq_para_logs (
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
CREATE INDEX IF NOT EXISTS sabaq_para_logs_child_time
  ON sabaq_para_logs(child_id, logged_at DESC);


CREATE TABLE IF NOT EXISTS manzil_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id        uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  logged_by       uuid NOT NULL,
  point_event_id  uuid REFERENCES point_events(id) ON DELETE SET NULL,
  manzil_number   smallint NOT NULL CHECK (manzil_number BETWEEN 1 AND 7),
  quality_rating  smallint CHECK (quality_rating BETWEEN 1 AND 5),
  notes           text,
  logged_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS manzil_logs_child_time
  ON manzil_logs(child_id, manzil_number, logged_at DESC);


-- -----------------------------------------------------------------------------
-- Curriculum + diary + homework + assignments + test_scores
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS curriculum_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id      uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  sequence        smallint,
  title           text NOT NULL,
  description     text,
  target_week     smallint,
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS curriculum_items_subject ON curriculum_items(subject_id, sequence);


CREATE TABLE IF NOT EXISTS diary_entries (
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
CREATE INDEX IF NOT EXISTS diary_entries_date ON diary_entries(entry_date DESC, class_id);


CREATE TABLE IF NOT EXISTS homework (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id        uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id      uuid REFERENCES subjects(id) ON DELETE SET NULL,
  title           text NOT NULL,
  description     text,
  attachment_url  text,
  due_date        date NOT NULL,
  posted_by       uuid NOT NULL,
  posted_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS homework_class_due ON homework(class_id, due_date);


CREATE TABLE IF NOT EXISTS homework_submissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id         uuid NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
  child_id            uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'pending',
  marked_by_user_id   uuid,
  marked_at           timestamptz,
  teacher_confirmed_by uuid,
  teacher_confirmed_at timestamptz,
  notes               text,
  UNIQUE (homework_id, child_id)
);
CREATE INDEX IF NOT EXISTS homework_submissions_child
  ON homework_submissions(child_id, status);


CREATE TABLE IF NOT EXISTS assignments (
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


CREATE TABLE IF NOT EXISTS test_scores (
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
CREATE INDEX IF NOT EXISTS test_scores_child ON test_scores(child_id, recorded_at DESC);


SELECT
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sabaq_logs')      AS has_sabaq_logs,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'manzil_logs')     AS has_manzil_logs,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'diary_entries')   AS has_diary_entries,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'homework')        AS has_homework,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'assignments')     AS has_assignments,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'test_scores')     AS has_test_scores;
