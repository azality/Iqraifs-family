-- =============================================================================
-- assignment media: video_url / audio_url / attachments
-- =============================================================================
-- Why:
--   Pilot feedback: teachers want to attach a YouTube video, audio, or a
--   PDF to homework/quiz assignments - lessons already support exactly
--   this trio, assignments did not. Same shapes as the lesson table:
--   attachments is a jsonb array of { label, url }.
-- =============================================================================

ALTER TABLE assignment ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE assignment ADD COLUMN IF NOT EXISTS audio_url text;
ALTER TABLE assignment ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
