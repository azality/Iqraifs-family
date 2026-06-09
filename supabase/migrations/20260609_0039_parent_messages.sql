-- Parent ↔ school messaging (PR feat/parent-contact-school).
--
-- One flat table, thread-folded by thread_id. The first message in a
-- thread has thread_id = its own id (set via update after insert; the
-- backend handles it). Replies share the same thread_id.
--
-- Direction is encoded by sent_by_role ('parent' | 'school') so a
-- thread's sender alternation is queryable without joining auth.users.
--
-- read_at = "the OTHER side has seen this message". Set when:
--   - parent_to_school message: any school staff opens the thread
--   - school_to_parent message: parent opens the thread
--
-- student_id is nullable — many messages are about a single child, but
-- general enquiries don't have to be tagged. When present, the admin
-- inbox can scope by class section.
--
-- Out of scope for this migration: attachments, SMS/email channels,
-- threading-by-subject merging. The body text field is generous (4 KB
-- per message) and that covers the school-pilot use cases.

CREATE TABLE IF NOT EXISTS public.parent_message (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  thread_id         uuid NOT NULL,
  parent_user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id        uuid REFERENCES public.student(id) ON DELETE SET NULL,
  subject           text,                                  -- only first message in a thread
  body              text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  sent_by           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sent_by_role      text NOT NULL CHECK (sent_by_role IN ('parent','school')),
  read_at           timestamptz,
  archived_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parent_message_thread
  ON public.parent_message(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_parent_message_org_unread
  ON public.parent_message(org_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_parent_message_parent
  ON public.parent_message(parent_user_id, created_at DESC);
