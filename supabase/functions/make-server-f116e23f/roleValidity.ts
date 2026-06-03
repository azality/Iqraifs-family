// Pure helpers for role validity. Extracted out of schoolAuth.ts so they
// have no transitive imports into npm:hono / supabase-js, which lets the
// Deno test runner load them without a full deno.json + deno install.
//
// schoolAuth.ts re-exports these so the rest of the codebase can continue
// to import everything from a single place.

/** YYYY-MM-DD slice of a Date in UTC. We use UTC date for the validity
 *  window so a 24h boundary doesn't get fuzzy across timezones. Schools
 *  that need per-org timezone precision can fix later. */
export function todayUtcDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export interface RoleRowForActiveCheck {
  revoked_at: string | null | undefined;
  valid_from: string | null | undefined;
  valid_until: string | null | undefined;
}

/** Pure helper: is this role row currently active?
 *  Active iff not revoked AND today within [valid_from, valid_until]
 *  (both inclusive, either can be null = open-ended). */
export function isRoleActiveNow(
  row: RoleRowForActiveCheck,
  today: string = todayUtcDate(),
): boolean {
  if (row.revoked_at !== null && row.revoked_at !== undefined) return false;
  if (row.valid_from && row.valid_from > today) return false;
  if (row.valid_until && row.valid_until < today) return false;
  return true;
}
