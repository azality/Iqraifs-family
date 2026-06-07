# Grant admin to smyounus121@gmail.com

One-time setup for the production Iqra Academy org. Run in
Supabase Dashboard → SQL editor as the project owner.

## Step 0 — confirm the user exists

```sql
SELECT id, email, created_at
FROM auth.users
WHERE lower(email) = lower('smyounus121@gmail.com');
```

If 0 rows: the user hasn't signed up yet. Have them complete the
parent-signup flow at `iqraifs.com/parent-signup` ONCE with that
email, then continue. (They'll see the family dashboard until you
grant the school role below — that's expected.)

## Step 1 — find the target org

```sql
SELECT id, name, slug, created_at, deleted_at
FROM organizations
WHERE deleted_at IS NULL
  AND name NOT ILIKE '%demo%'
  AND COALESCE(slug,'') NOT ILIKE '%demo%'
ORDER BY created_at ASC;
```

You should see one active non-demo school. Copy its `id` into
the next step. If multiple show up, pick by name.

## Step 2 — grant admin

Replace `<ORG_ID_HERE>` with the id from step 1.

```sql
INSERT INTO user_roles (user_id, role_type, scope_type, scope_id, granted_by)
SELECT
  u.id,
  'admin'::role_type,
  'organization'::role_scope_type,
  '<ORG_ID_HERE>'::uuid,
  u.id                                   -- self-granted (no other admin yet)
FROM auth.users u
WHERE lower(u.email) = lower('smyounus121@gmail.com')
ON CONFLICT (user_id, role_type, scope_type, scope_id)
DO UPDATE SET revoked_at = NULL;         -- re-activate if previously revoked
```

The `ON CONFLICT` makes the script idempotent — re-running is safe.

## Step 3 — verify

```sql
SELECT u.email, o.name AS org_name, ur.role_type,
       ur.scope_type, ur.granted_at, ur.revoked_at
FROM user_roles ur
JOIN auth.users u     ON u.id = ur.user_id
JOIN organizations o  ON o.id = ur.scope_id
WHERE u.email = 'smyounus121@gmail.com'
  AND ur.revoked_at IS NULL;
```

Expect one row with `role_type = 'admin'`, `revoked_at = null`.

## Step 4 — confirm in the app

Ask smyounus to sign out + sign back in (the `/school/me` cache is
~30s but a fresh login is cleanest). They should now land in
`/school/orgs/<org-id>` with the admin sidebar.

## Why `admin` and not `principal`?

`principal` carries org-ownership powers (transfer ownership,
delete school, change billing). Admin gets day-to-day management
(students, parents, teachers, classes, fees, announcements)
without ownership. If they need ownership later, swap
`'admin'::role_type` for `'principal'::role_type` in step 2 and
re-run — the unique key picks it up.
