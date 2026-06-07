-- =============================================================================
-- School Pilot — Topic resource file uploads.
--
-- Phase 1E shipped topic_resource as URL-only ("paste a Google Drive link").
-- For the pilot — and especially Iqra Academy where most admins live in
-- WhatsApp + their phones, not a cloud drive — direct upload from the
-- computer is the right primitive.
--
-- Approach: keep `url` as the source of truth for what the UI renders
-- (signed URL for files, external URL for links). Add `storage_path` so
-- the server knows which Storage object to re-sign + delete. `mime_type`
-- + `byte_size` are captured at upload time for display ("PDF · 2.3 MB").
--
-- The bucket is PRIVATE — no anon policies. All reads/writes go through
-- the edge function with the service role, which mints short-lived
-- signed URLs on demand. This keeps a school's worksheet from leaking
-- via guessable URLs.
--
-- Idempotent.
-- =============================================================================

ALTER TABLE topic_resource
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS mime_type    text,
  ADD COLUMN IF NOT EXISTS byte_size    integer;

-- Index on storage_path so the deletion cascade can find orphan rows
-- if a bucket cleanup runs in the future.
CREATE INDEX IF NOT EXISTS topic_resource_storage_path
  ON topic_resource(storage_path)
  WHERE storage_path IS NOT NULL;

-- Create the private bucket. The Supabase Dashboard tracks buckets in
-- storage.buckets; INSERT ... ON CONFLICT keeps this idempotent for
-- re-runs across environments.
INSERT INTO storage.buckets (id, name, public)
VALUES ('curriculum-resources', 'curriculum-resources', false)
ON CONFLICT (id) DO NOTHING;

-- NOTE: We deliberately do NOT add any storage RLS policies. The bucket
-- stays inaccessible to anon/auth tokens; the edge function holds the
-- service role and is the only path in or out. This is the same model
-- the rest of the school-pilot uses for tables we don't want directly
-- queryable from the client.
