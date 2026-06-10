-- =============================================================================
-- behavior_category — org-configurable category buckets for behavior notes.
-- =============================================================================
-- Why:
--   Until now BehaviorLogEntry has hardcoded a generic Western list (Respect,
--   Effort, Helpfulness…). Iqra Academy and similar Hifz schools want
--   context-appropriate buckets: adab, akhlaq, salah punctuality, Quran
--   etiquette, etc. Each school may add/remove/rename their own.
--
-- Shape:
--   - org-scoped (each school has its own list)
--   - kind = 'positive' | 'concern' | 'both' (some buckets like "adab" or
--     "respect" make sense as both positive observations and concerns)
--   - sort_order so the principal controls visual ordering
--   - archived_at so we can hide retired categories without losing the
--     reference from historical behavior_note rows (note.category is text)
--
-- Lazy default seeding happens in the GET endpoint (behaviorCategories.tsx).
-- =============================================================================

CREATE TABLE IF NOT EXISTS behavior_category (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key             text NOT NULL,
  label           text NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('positive', 'concern', 'both')),
  sort_order      smallint NOT NULL DEFAULT 0,
  archived_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, key)
);

CREATE INDEX IF NOT EXISTS behavior_category_org_active
  ON behavior_category(org_id, sort_order)
  WHERE archived_at IS NULL;

-- Verify
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'behavior_category') AS has_behavior_category;
