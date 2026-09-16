-- Supabase security alert (13 Sep 2026): rls_disabled_in_public.
--
-- Nine tables were created without ROW LEVEL SECURITY. Every legitimate
-- access path in this codebase goes through the Edge Function's service
-- role, which BYPASSES RLS -- but the public anon key (shipped in every
-- browser) could read, edit and delete these tables directly through
-- PostgREST. Verified live before this migration: anon reads returned
-- real exam_schedule and assignment_submission rows.
--
-- Enabling RLS with NO policies is the whole fix: anon/authenticated
-- default to deny, the service role is unaffected, and nothing in the
-- app talks to PostgREST from the client. This matches every other
-- table in the schema, which already had RLS on.
--
-- Belt and braces: the loop covers ANY public table with RLS off, so a
-- future table someone forgets is caught the next time this file runs
-- (it is idempotent).

do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    raise notice 'RLS enabled on %', t.relname;
  end loop;
end $$;
