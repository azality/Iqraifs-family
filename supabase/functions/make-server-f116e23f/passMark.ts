// The school's pass mark — one reader, one default.
//
// Every surface that judges a pass or a fail must use the SCHOOL's
// threshold, not a number we picked: the tabulation's red marks and
// unranked children, the marks sheet as a teacher types, the report
// card's verdict, and the teacher-performance pass rate. IFS uses 40;
// another school may use 33, and nothing should need a code change
// (Muneeb, 22 Sep).
//
// The setting is `settings.pass_mark_pct` on the organisation, editable
// at Settings → Organization. DEFAULT_PASS_MARK_PCT applies only until
// a school sets their own.

import { serviceRoleClient } from "./middleware.tsx";

/** Used only when a school has not set one. Not a rule — a starting
 *  point, and the Settings field says so. */
export const DEFAULT_PASS_MARK_PCT = 40;

/** The school's pass mark, as a percentage. One percentage covers every
 *  paper size: 40% is 30 of 75 and 40 of 100, which is exactly why the
 *  school's two numbers were one setting (Ambreen, 22 Sep). */
export async function orgPassMarkPct(orgId: string): Promise<number> {
  const { data } = await serviceRoleClient
    .from("organizations").select("settings").eq("id", orgId).maybeSingle();
  const raw = Number((data as any)?.settings?.pass_mark_pct);
  // A stored 0 or a nonsense value must not turn every child into a
  // pass; fall back rather than trust it.
  return Number.isFinite(raw) && raw > 0 && raw <= 100 ? raw : DEFAULT_PASS_MARK_PCT;
}

/** Is this percentage a fail? Null (nothing marked yet) is never a
 *  fail — a pending paper must not brand a child. */
export function isFailing(pct: number | null | undefined, passMarkPct: number): boolean {
  return pct !== null && pct !== undefined && pct < passMarkPct;
}
