-- =============================================================================
-- announcement.publish_publicly — surface key news on the public school site.
-- =============================================================================
-- Why:
--   Phase 2 of the public school site. The admin checks "Publish to
--   public site" on important announcements (open house, holiday closure,
--   admissions news) so visitors at /iqra-demo see them too. Defaults
--   to false — existing audience-targeted announcements stay private.
-- =============================================================================

ALTER TABLE announcement
  ADD COLUMN IF NOT EXISTS publish_publicly boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS announcement_public
  ON announcement(org_id, created_at DESC)
  WHERE publish_publicly = true AND archived_at IS NULL;

-- Verify
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'announcement' AND column_name = 'publish_publicly'
) AS has_publish_publicly;
