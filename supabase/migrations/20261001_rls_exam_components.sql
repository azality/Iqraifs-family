-- Supabase advisor, 27 Sep 2026: rls_disabled_in_public on exam_component
-- and exam_component_score - the only two public tables without RLS. They
-- were created after the school-wide RLS pass and missed it, leaving both
-- (including children's marks) readable AND writable with the anon key
-- that ships in the frontend bundle.
--
-- The fix is enable-only, no policies: every legitimate access path goes
-- through the Edge Function's service role, which bypasses RLS, so this
-- closes the PostgREST door without changing live behavior. This is the
-- same posture as every other table in the schema (RLS on, zero policies).
--
-- Idempotent: ENABLE ROW LEVEL SECURITY on an already-enabled table is a
-- no-op.

alter table public.exam_component enable row level security;
alter table public.exam_component_score enable row level security;
