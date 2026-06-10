-- =============================================================================
-- parent.canonical_id — coalesce duplicate parent rows across campuses.
-- =============================================================================
-- Why:
--   A parent with a child at Campus A and another at Campus B currently
--   has two parent rows (because parent is org-scoped), two PINs, two
--   logins. We want one login that sees both kids.
--
-- Model:
--   Pick the parent's "home" campus row as the canonical record. Other
--   campus rows for the same human set canonical_id = canonical_row.id.
--   The PIN-auth layer treats a login at any aliased row as a login as
--   the canonical subject; resolveAccessibleStudents() walks the alias
--   graph and returns student_parent rows for all of them.
--
--   This is a soft coalescence: each campus still has its own parent
--   row in its own data; the link table effectively de-dups for portal
--   visibility.
-- =============================================================================

ALTER TABLE parent
  ADD COLUMN IF NOT EXISTS canonical_id uuid REFERENCES parent(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS parent_canonical
  ON parent(canonical_id)
  WHERE canonical_id IS NOT NULL;

-- Verify
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'parent' AND column_name = 'canonical_id'
) AS parent_has_canonical;
