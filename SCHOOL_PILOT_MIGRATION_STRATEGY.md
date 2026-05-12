# School Pilot — KV → Postgres migration strategy

**Status:** draft, not started. Companion to `supabase/migrations/20260511_0001_school_pilot_schema.sql` and `SCHOOL_PILOT_SPEC.md`.

## The problem

Today, all family + child + event data lives in Supabase **Deno KV** (key-value store). The school model needs cross-tenant queries — *"show me all students in Grade 3-A who logged Fajr today"* — which KV cannot answer efficiently. We have to move to Postgres.

This must happen **without breaking the existing family product**, which has live users.

## The strategy: parallel writes, gradual cutover

Three phases. Each is its own PR.

### Phase 1 — Lay the table (1 week)
- Run the schema migration. Tables exist, empty.
- Seed the Iqra Academy organization row.
- **No app code changes yet.** Family product still 100% on KV. School product doesn't exist yet.
- **Risk:** zero. Empty tables can be dropped.
- **Reversible:** yes, drop tables.

### Phase 2 — Dual-write + read-from-Postgres for school surfaces (3 weeks)
- New endpoints (school-only): `POST /classes`, `POST /enrollments`, `POST /sabaq-logs`, etc. Write to Postgres only.
- Existing endpoints (`POST /events`, `POST /children`, etc.): **write to BOTH** KV and Postgres. Read still from KV.
- Build a sync worker that backfills KV → Postgres for existing families. Runs once, idempotent.
- Family app keeps working unchanged because it reads KV.
- School app reads Postgres (no KV at all for school data).
- **Risk:** dual-write divergence. Add a nightly reconcile job that counts rows per child in both stores; alert on drift.
- **Reversible:** yes — stop writing to Postgres, drop tables. KV is still the source of truth.

### Phase 3 — Flip reads to Postgres, retire KV (2 weeks)
- Family endpoints switch reads from KV to Postgres, behind a feature flag (`READ_FROM_POSTGRES=true`).
- Roll forward by family — first the dogfood family (yours), then 5%, then 25%, then 100%.
- Keep writing to KV in parallel for 30 days as a rollback safety net.
- After 30 days of clean Postgres-only reads, stop writing to KV. Archive the KV data as a JSON dump to cold storage.
- **Risk:** read parity bugs (Postgres returns slightly different shape than KV). Smoke test every endpoint after flip.
- **Reversible during the 30-day window:** flip the feature flag back to KV. After 30 days, point-of-no-return.

## Data shape conversions

The non-trivial mappings:

| KV today | Postgres |
|----------|----------|
| `family:<id>` blob with `parentIds: string[]` | `families` row + `family_members` rows |
| `child:<id>` blob with `streaks: {}, hifzProgress: {}` | `children` row; streaks → separate `streaks` table later, `hifz_progress` stays on the row as JSONB |
| `event:<ts>:<rand>` blobs | `point_events` rows. `idempotencyKey` becomes the UNIQUE constraint. |
| `singleton:<childId>:<itemId>:<date>` lock keys | dropped — Postgres uses `UNIQUE (child_id, trackable_item_id, date_trunc('day', occurred_at))` partial index |
| `caplock:<childId>:<date>` cap locks | dropped — Postgres uses row-level lock during the cap-check transaction |
| KV scan-by-prefix patterns (`getByPrefix`) | replaced with indexed SELECTs |

## Compat shim during dual-write

The Edge Function code lives in `supabase/functions/make-server-f116e23f/`. During Phase 2:

1. Wrap KV reads/writes behind an adapter (`store.ts` interface).
2. Implement two adapters: `kvStore` (current) and `pgStore` (new).
3. A `dualStore` wraps both — writes to both, reads from KV (Phase 2), then reads from Postgres (Phase 3).
4. Phase 4 deletes the kvStore and dualStore.

Estimated diff: ~600 lines of adapter glue. Not glamorous, but isolates the risk.

## Postgres tenancy + RLS

**Decision needed (deferred to its own PR):** RLS policies vs app-level scoping.

- App-level scoping is faster to build (we control every query in the Edge Function). One bug = data leak across tenants.
- RLS is harder but defense-in-depth. A bug in app code can't leak data.

Recommendation: ship Phase 2 with **app-level scoping only**, then add RLS as Phase 2.5 before the public pilot starts. Audit the RLS policies once; benefit forever.

## Backups during migration

Before Phase 3 cutover:
1. Full KV export to JSON, stored as a Supabase storage object with a 1-year retention.
2. Full Postgres `pg_dump` immediately after cutover.
3. Snapshot daily during the 30-day window.

If anything goes sideways, we have receipts.

## What happens to the family product during all this?

It keeps working. Phase 2 is invisible to family users. Phase 3 cutover is gated by a per-family feature flag — your own family flips first, then we wait, then we ramp.

## What I need from you to actually execute

1. **Supabase project details** — is the existing project where the Edge Function lives the one that gets the Postgres tables, or do you want a new project for school? If same project, I need either:
   - SQL editor access (you run the migration via the Supabase dashboard), OR
   - Service-role key for a CLI flow.
2. **Confirmation on RLS deferral** — OK with app-level scoping for Phase 2, RLS in Phase 2.5?
3. **A staging environment** — strongly recommend duplicating the prod Supabase project into a `staging` instance so Phase 2 dual-write can be exercised without risk. ~$25/mo extra.
4. **Approval to dual-write existing family data** — Phase 2 means every event from every family also writes to Postgres. Confirm you're OK with that as a temporary state.

## Estimated effort

- Schema (this PR): ~6 hours **done**
- Phase 1 deploy: 1 day
- Phase 2 dual-write + sync worker: ~3 weeks of focused work
- RLS pass (Phase 2.5): ~1 week
- Phase 3 cutover + flag work: ~2 weeks
- Total: ~6–7 weeks before school-feature work can start in earnest

This fits inside the 13-week budget but leaves no slack. Hence the spec-side discipline (cut Hifz to sabaq/sabaq-para/manzil only, no PDFs, no offline).
