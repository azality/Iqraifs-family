-- pin_credential.login_count (24 Sep 2026).
--
-- "I want to see which parent uses the app the most" - but we only kept
-- last_login_at, overwritten on every sign-in, so a parent who opens the
-- portal daily and one who opened it once look identical. Count the
-- sign-ins from here on.
--
-- Counting happens through bump_pin_login() so two sign-ins landing
-- together can't lose one (read-modify-write from the edge function
-- would); it also carries the stamp + unlock the login path already did.
--
-- Idempotent: safe to re-run.

ALTER TABLE pin_credential
  ADD COLUMN IF NOT EXISTS login_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN pin_credential.login_count IS
  'Successful sign-ins since 24 Sep 2026. Zero with a non-null last_login_at means the sign-ins predate counting.';

CREATE OR REPLACE FUNCTION bump_pin_login(cred_id uuid)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE pin_credential
  SET login_count = login_count + 1,
      last_login_at = now(),
      failed_attempts = 0,
      locked_until = NULL
  WHERE id = cred_id;
$$;
