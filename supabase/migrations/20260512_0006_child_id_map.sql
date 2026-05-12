-- =============================================================================
-- child_id_map — bridge KV children (legacy family product) to Postgres
-- children (school pilot).
-- =============================================================================
-- Why:
--   The family product stores kids in `kv_store_f116e23f` with string IDs
--   like "child:1234567890". The school pilot creates Postgres rows in
--   `children` with UUID ids. When a parent claims an invite and links it
--   to one of their existing KV kids, we record the mapping here so:
--     1. The family Dashboard can show school events for that kid.
--     2. Eventual KV→Postgres migration has the bridge data already.
--
--   Without this mapping, the family product and school product see two
--   different children even when they refer to the same human.
--
-- Lifecycle:
--   Inserted at POST /school/parent-invites/:code/accept when the parent
--   chooses "merge into existing family" AND specifies which KV child the
--   school student corresponds to. Never updated. Deleted only via
--   ON DELETE CASCADE if the Postgres child is removed.
-- =============================================================================

CREATE TABLE IF NOT EXISTS child_id_map (
  kv_child_id        text PRIMARY KEY,
  postgres_child_id  uuid NOT NULL UNIQUE REFERENCES children(id) ON DELETE CASCADE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid NOT NULL
);

CREATE INDEX IF NOT EXISTS child_id_map_pg ON child_id_map(postgres_child_id);

-- Verify
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'child_id_map') AS has_child_id_map;
