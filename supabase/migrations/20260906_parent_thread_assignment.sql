-- Who is handling a parent inquiry.
--
-- Three roles share the parent inbox (admin, principal, office_staff),
-- and at the pilot school the admin works it while the principal
-- watches. Nothing recorded who had picked something up, so both could
-- answer the same parent and the parent got two replies from "the
-- school" with no way to tell which counted.
--
-- Threads are implicit here - a thread is just the rows of
-- parent_message sharing a thread_id - so there is no thread row to
-- hang this on. One small table keyed by thread does it.
--
-- Deliberately NOT part of the waiting count: a claimed thread that
-- has not been answered is still a parent waiting. Claiming says who is
-- on it, not that it is done. Answering is what clears the queue (see
-- read_at, which means "answered" since the same review).
--
-- Releasing deletes the row rather than nulling the column, so
-- "unassigned" has exactly one representation.

create table if not exists parent_thread_assignment (
  thread_id   uuid primary key,
  org_id      uuid not null,
  assigned_to uuid not null,
  assigned_by uuid not null,
  assigned_at timestamptz not null default now()
);

-- The inbox lists a whole org's threads at once, so the lookup is by org.
create index if not exists parent_thread_assignment_org
  on parent_thread_assignment (org_id);

-- "What am I holding?" across the org.
create index if not exists parent_thread_assignment_assignee
  on parent_thread_assignment (org_id, assigned_to);
