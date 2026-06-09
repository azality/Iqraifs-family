-- Notification scaffold (rec #2).
--
-- One table — `notification_event` — that captures every outbound
-- notification the platform wants to send (SMS, email, push). Decoupled
-- from delivery so trigger points stay simple and the actual provider
-- can be plugged in later (Twilio, JazzSMS, Mailgun, FCM).
--
-- Lifecycle:
--   queued   — trigger point inserted a row, sender hasn't run yet
--   sending  — sender picked it up
--   sent     — provider acknowledged delivery
--   failed   — provider returned an error (retry up to max_attempts)
--
-- recipient is stored as a string so SMS phone numbers, email addrs,
-- and FCM device tokens all share the same row shape. channel
-- disambiguates ('sms' | 'email' | 'push' | 'log'). The 'log' channel
-- is the no-op stub sender used until a real provider is wired up.
--
-- subject_type + subject_id let analytics later answer "how many
-- notifications were sent about Hassan Ali in the last 30 days?"
-- without joining lots of tables.

CREATE TABLE IF NOT EXISTS public.notification_event (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel        text NOT NULL CHECK (channel IN ('sms','email','push','log')),
  recipient      text NOT NULL,            -- phone, email, or device token
  template_key   text NOT NULL,            -- e.g. 'fee_due', 'message_reply', 'report_card_published'
  template_vars  jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- What the notification is "about" — for analytics + de-dup. Optional
  -- since some notifications (system-wide announcements) have no subject.
  subject_type   text CHECK (subject_type IS NULL OR subject_type IN ('student','parent','fee','message','announcement','report_card')),
  subject_id     uuid,
  status         text NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued','sending','sent','failed','cancelled')),
  attempts       int NOT NULL DEFAULT 0,
  max_attempts   int NOT NULL DEFAULT 3,
  last_error     text,
  sent_at        timestamptz,
  scheduled_for  timestamptz NOT NULL DEFAULT now(),  -- defer notifications
  dedup_key      text,                     -- optional; prevents duplicate sends
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Sender process polls by status + scheduled_for. Index supports it.
CREATE INDEX IF NOT EXISTS idx_notification_due
  ON public.notification_event(status, scheduled_for)
  WHERE status IN ('queued','failed');

-- Per-subject lookup for analytics.
CREATE INDEX IF NOT EXISTS idx_notification_subject
  ON public.notification_event(subject_type, subject_id);

-- Dedup: at most one queued/sent row per (org, dedup_key). Lets trigger
-- points blindly insert without checking — duplicate inserts no-op.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notification_dedup
  ON public.notification_event(org_id, dedup_key)
  WHERE dedup_key IS NOT NULL;
