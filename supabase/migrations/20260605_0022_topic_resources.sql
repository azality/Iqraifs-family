-- =============================================================================
-- School Pilot — Topic resources. Phase 1E.
--
-- Durable resources attached to a curriculum topic — the worksheet, video,
-- PDF, or quiz the admin uploads once and that's available every time the
-- topic is taught (across sections, across daily lessons, across years if
-- copied forward).
--
-- Distinct from lesson.attachments[] which is "what the teacher used on
-- THIS specific day" — transient.
--
-- Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS topic_resource (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  curriculum_topic_id   uuid NOT NULL REFERENCES curriculum_topic(id) ON DELETE CASCADE,
  -- kind controls icon + display treatment in the UI:
  --   pdf       — any document (worksheets, slides, summaries)
  --   video     — YouTube / Vimeo / generic video link (thumbnail rendered)
  --   worksheet — labeled like pdf but with a distinct icon for filtering
  --   link      — generic external resource (article, interactive demo)
  --   quiz      — link to an external quiz (Google Forms, Kahoot, etc.) OR
  --               eventually a native quiz once we build one
  kind                  text NOT NULL CHECK (kind IN ('pdf','video','worksheet','link','quiz')),
  label                 text NOT NULL,
  url                   text NOT NULL,
  description           text,
  sort_order            smallint NOT NULL DEFAULT 0,
  added_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  archived_at           timestamptz
);

CREATE INDEX IF NOT EXISTS topic_resource_topic
  ON topic_resource(curriculum_topic_id, sort_order)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS topic_resource_org
  ON topic_resource(org_id)
  WHERE archived_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_topic_resource_updated'
  ) THEN
    CREATE TRIGGER trg_topic_resource_updated BEFORE UPDATE ON topic_resource
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;
