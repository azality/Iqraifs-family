-- =============================================================================
-- Hard-delete background job for soft-deleted orgs (PR H)
-- =============================================================================
-- Migration 0014 added soft-delete columns to organizations. This migration
-- closes the loop: a daily pg_cron job hard-deletes any org whose
-- purge_after has elapsed. Cascading FKs (organizations.id → ON DELETE
-- CASCADE on every child table) take care of the rest.
--
-- We write a final entry to purged_org_log BEFORE the DELETE so there's an
-- audit trail of which orgs were nuked when. invite_audit_log entries DO
-- get cascade-deleted along with the org — that's intentional (hard-delete
-- is total), but the post-purge record in purged_org_log survives forever.
-- =============================================================================

CREATE TABLE IF NOT EXISTS purged_org_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL,                          -- snapshot, NOT a FK
  org_name    text NOT NULL,
  org_slug    text,
  deleted_at  timestamptz NOT NULL,                    -- when soft-delete happened
  purged_at   timestamptz NOT NULL DEFAULT now(),      -- when this job ran
  deleted_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  details     jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS purged_org_log_purged_at_idx
  ON purged_org_log (purged_at DESC);

COMMENT ON TABLE purged_org_log IS
  'Permanent record of orgs hard-deleted by the daily purge job. Does NOT FK to organizations because the org is gone by the time we write here.';

-- Idempotent purge function. Returns the number of orgs hard-deleted.
-- Safe to call manually for testing: SELECT purge_soft_deleted_orgs();
CREATE OR REPLACE FUNCTION purge_soft_deleted_orgs() RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER  -- so pg_cron (postgres role) can use it
SET search_path = public
AS $$
DECLARE
  v_row organizations%ROWTYPE;
  v_count integer := 0;
BEGIN
  FOR v_row IN
    SELECT *
      FROM organizations
     WHERE deleted_at IS NOT NULL
       AND purge_after IS NOT NULL
       AND purge_after < now()
  LOOP
    -- Snapshot the row to the permanent log BEFORE deletion. CASCADE will
    -- shortly wipe the org and everything under it including invite_audit_log.
    INSERT INTO purged_org_log (org_id, org_name, org_slug, deleted_at, deleted_by, details)
    VALUES (
      v_row.id,
      v_row.name,
      v_row.slug,
      v_row.deleted_at,
      v_row.deleted_by,
      jsonb_build_object(
        'purge_after', v_row.purge_after,
        'plan', v_row.plan,
        'org_type', v_row.org_type
      )
    );

    DELETE FROM organizations WHERE id = v_row.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION purge_soft_deleted_orgs IS
  'Hard-deletes orgs whose 30-day grace window has elapsed. Idempotent. Returns count.';

-- =============================================================================
-- Schedule daily at 02:15 UTC. pg_cron must be enabled on the project
-- (Supabase Dashboard → Database → Extensions → pg_cron). The schedule is
-- recreated each migration (DROP + CREATE) so re-running this file is safe.
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;

    -- Drop the existing schedule if any so we don't get duplicates.
    PERFORM cron.unschedule(jobid)
      FROM cron.job
     WHERE jobname = 'purge_soft_deleted_orgs_daily';

    PERFORM cron.schedule(
      'purge_soft_deleted_orgs_daily',
      '15 2 * * *',                   -- 02:15 UTC every day
      $job$ SELECT public.purge_soft_deleted_orgs(); $job$
    );
  ELSE
    RAISE NOTICE 'pg_cron extension not available. Schedule manually or enable pg_cron in Supabase dashboard, then re-run this migration.';
  END IF;
END;
$$;
