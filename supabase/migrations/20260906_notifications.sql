-- In-app notifications (the bell), staff first.
--
-- Deliberately NOT a queue. The dispatcher in notify.tsx is built for
-- outbound channels (sms / email / push) and its notification_event
-- table was never created — so nothing has ever been queued or sent.
-- A bell is a different thing: it answers "what needs me right now?",
-- and that is derivable from data we already hold. Computing it on
-- read means it can never go stale, can never be missed because a cron
-- didn't run, and needs no backfill.
--
-- So only two things need storing:
--
--   notification_read  which alerts this person has already seen or
--                      dismissed, keyed by the alert's stable key
--   notification_pref  which optional alert kinds are on, either as a
--                      ROLE default the principal sets, or a personal
--                      override within what the principal allows
--
-- Mandatory alert kinds (roll call not taken, a concern about your
-- child, a hafiz milestone awaiting confirmation) are enforced in code
-- and cannot be switched off by either scope — a preference row for
-- them is ignored.

create table if not exists notification_read (
  org_id     uuid not null,
  user_id    uuid not null,
  alert_key  text not null,
  read_at    timestamptz not null default now(),
  primary key (org_id, user_id, alert_key)
);

comment on table notification_read is
  'Per-user read/dismiss state for derived bell alerts, keyed by the alert''s stable key.';

create table if not exists notification_pref (
  org_id     uuid not null,
  -- 'role' = the principal's default for everyone with that role.
  -- 'user' = one person's override, allowed only where the role default
  --          is not locked.
  scope      text not null check (scope in ('role', 'user')),
  scope_id   text not null,
  kind       text not null,
  enabled    boolean not null,
  updated_at timestamptz not null default now(),
  primary key (org_id, scope, scope_id, kind)
);

comment on table notification_pref is
  'Notification policy: role defaults set by the principal, personal overrides within them.';

create index if not exists idx_notification_read_user
  on notification_read (org_id, user_id);
