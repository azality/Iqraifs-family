-- pin_credential.last_login_at
--
-- /school/auth/pin-login has always written this column on a successful
-- sign-in, but it was never created. PostgREST rejects the whole UPDATE
-- for the unknown column, so the accompanying `failed_attempts: 0` reset
-- silently never applied either: a parent's failed-attempt count only
-- ever went up, and stale typos from earlier sessions pushed them into
-- the 15-minute lockout on their next single mistake.
--
-- Adding the column makes that UPDATE valid again, and gives the office
-- an honest "has this parent ever actually signed in?" signal.

alter table pin_credential
  add column if not exists last_login_at timestamptz;

comment on column pin_credential.last_login_at is
  'Last successful PIN sign-in. Null means the issued PIN was never used.';
