-- Topic → assessment-term attribution.
--
-- Schools that divide the year into assessment terms (IFS: 1st Assessment
-- May–Sep, 2nd after) can tag each curriculum topic with the term it is
-- taught in. NULL = whole-year syllabus (Junior/Reception at IFS have no
-- assessments at all). Coverage/pace rollups and lesson-prep "Up next"
-- count only current-term + untagged topics, so a future term's syllabus
-- can be loaded early without polluting live progress numbers.
--
-- Applied to the live DB 2026-08-24 via the temporary nonce-gated
-- endpoint (remote migration history is unrecorded; supabase db push is
-- unsafe here). This file is the committed record.

ALTER TABLE curriculum_topic
  ADD COLUMN IF NOT EXISTS academic_term_id uuid
  REFERENCES academic_term(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_curriculum_topic_term
  ON curriculum_topic(academic_term_id);

-- Backfill (run once, also already applied): topics of assessed classes
-- tagged to the current term; Junior/Reception/Sandbox left NULL.
-- UPDATE curriculum_topic SET academic_term_id = <current term id>
--  WHERE curriculum_id IN (<curricula of assessed classes>)
--    AND academic_term_id IS NULL;
