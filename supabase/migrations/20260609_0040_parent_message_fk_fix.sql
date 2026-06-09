-- Parent message FK fix (PR fix/parent-message-fks).
--
-- The original migration (20260609_0039_parent_messages.sql) declared
-- both parent_user_id and sent_by as FKs to auth.users(id). That was
-- wrong for this codebase:
--
--   - Parents in this app are rows in public.parent with PIN auth; they
--     are NOT Supabase Auth users. So parent_user_id should reference
--     public.parent(id), not auth.users(id). The seed surfaced this by
--     hitting parent_message_parent_user_id_fkey on every insert.
--
--   - sent_by is application-polymorphic: parent.id when a parent
--     sent the message, auth.users.id when a school staff member did.
--     Postgres can't FK across two parent tables without a join column
--     or trigger, so we drop the FK and rely on sent_by_role to
--     disambiguate at read time. The application layer keeps it
--     consistent.
--
-- This migration is idempotent — DROP CONSTRAINT IF EXISTS plus
-- conditional ADD CONSTRAINT skip the re-add when run twice.

ALTER TABLE public.parent_message
  DROP CONSTRAINT IF EXISTS parent_message_parent_user_id_fkey;
ALTER TABLE public.parent_message
  DROP CONSTRAINT IF EXISTS parent_message_sent_by_fkey;

-- Re-add parent_user_id FK pointing at the real parents table.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'parent_message'
      AND constraint_name = 'parent_message_parent_user_id_fkey'
  ) THEN
    ALTER TABLE public.parent_message
      ADD CONSTRAINT parent_message_parent_user_id_fkey
        FOREIGN KEY (parent_user_id)
        REFERENCES public.parent(id)
        ON DELETE CASCADE;
  END IF;
END$$;
