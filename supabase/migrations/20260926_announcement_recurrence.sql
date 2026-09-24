-- Recurring announcements (24 Sep 2026).
--
-- "We want to do last friday of the month" - a standing announcement
-- that posts itself: weekly on a weekday, or the first/last <weekday>
-- of every month. No cron in this stack, so rows carry next_post_at
-- and the feeds materialize due instances lazily on read (the same
-- pattern as results-day publishing).
--
--   lead_days       - the instance appears this many days BEFORE the
--                     occurrence (parents need warning to pack a toy).
--   next_occurrence - the date the next instance is ABOUT.
--   next_post_at    - when that instance should appear in feeds.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS announcement_recurrence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  author_user_id uuid,
  title text NOT NULL,
  body text NOT NULL,
  audience_kind text NOT NULL,
  audience_section_id uuid,
  audience_class_id uuid,
  audience_subject_id uuid,
  audience_program text,
  freq text NOT NULL CHECK (freq IN ('weekly','monthly_first','monthly_last')),
  weekday int NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0=Sunday
  lead_days int NOT NULL DEFAULT 1 CHECK (lead_days BETWEEN 0 AND 14),
  next_occurrence date NOT NULL,
  next_post_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_announcement_recurrence_due
  ON announcement_recurrence(org_id, next_post_at) WHERE active;
ALTER TABLE announcement_recurrence ENABLE ROW LEVEL SECURITY;
