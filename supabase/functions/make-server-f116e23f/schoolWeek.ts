// The school's own week, taken from its own timetable.
//
// Extracted from schoolDashboard so the parent inbox can age a waiting
// thread in SCHOOL days: a message sent on Friday evening has not been
// ignored by Monday morning. A second copy of this logic would drift
// exactly the way the two stored "school week" settings did.

import { serviceRoleClient } from "./middleware.tsx";
import { todayInOrgTz } from "./tz.ts";

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 3600 * 1000);
}
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// What counts as a school day, per bell schedule.
//
// The old isWeekday()/lastNWeekdays() pair hardcoded Mon-Fri (removed
// with this change). That was wrong for this school in
// both directions: Hifz runs Saturday, so a Saturday with no register
// never counted as a missed day; and any school closed on a Friday would
// be nagged for it. The timetable already knows - a schedule rings on a
// weekday if it has a slot there - so ask it instead of assuming, the
// same rule #469 gave today-ops.
//
// Per SCHEDULE, not per school: using an org-wide union would put the
// academic wings back on the hook for Saturdays that only Hifz runs.
export type SchoolWeek = {
  /** schedule_key -> ISO weekdays (1=Mon..7=Sun) that schedule rings. */
  daysBySchedule: Map<string, Set<number>>;
  /** Union across real schedules - for org-level windows. */
  orgDays: Set<number>;
  holidays: Array<{ from: string; to: string }>;
};

export async function loadSchoolWeek(orgId: string): Promise<SchoolWeek> {
  const [slotRows, orgRow] = await Promise.all([
    serviceRoleClient
      .from("timetable_slot")
      .select("schedule_key, day_of_week")
      .eq("org_id", orgId)
      .is("archived_at", null),
    serviceRoleClient
      .from("organizations")
      .select("settings")
      .eq("id", orgId)
      .maybeSingle(),
  ]);

  const daysBySchedule = new Map<string, Set<number>>();
  const orgDays = new Set<number>();
  for (const r of (slotRows.data ?? []) as any[]) {
    const key = r.schedule_key ?? "default";
    if (key === "sandbox") continue; // QA scaffolding rings every day
    const dow = Number(r.day_of_week);
    if (!Number.isInteger(dow) || dow < 1 || dow > 7) continue;
    if (!daysBySchedule.has(key)) daysBySchedule.set(key, new Set());
    daysBySchedule.get(key)!.add(dow);
    orgDays.add(dow);
  }

  const raw = ((orgRow.data as any)?.settings?.school_year?.holidays ?? []) as any[];
  const holidays = raw
    .filter((h) => typeof h?.startDate === "string")
    .map((h) => ({ from: h.startDate as string, to: (h.endDate || h.startDate) as string }));

  return { daysBySchedule, orgDays, holidays };
}

export function isHolidayOn(week: SchoolWeek, iso: string): boolean {
  return week.holidays.some((h) => iso >= h.from && iso <= h.to);
}

/** ISO weekday (1=Mon..7=Sun) of a Date, read in UTC like the helpers here. */
export function isoDowOf(d: Date): number {
  return ((d.getUTCDay() + 6) % 7) + 1;
}

/** The last `n` dates a given schedule actually ran, ending on or before
 *  `anchor`, oldest -> newest. Holidays are not school days. Returns
 *  fewer than n only if the schedule barely runs; the 120-day cap stops
 *  a schedule with no slots from spinning. */
export function lastNSchoolDays(
  week: SchoolWeek,
  scheduleKey: string | null | undefined,
  anchor: Date,
  n: number,
): string[] {
  const days = week.daysBySchedule.get(scheduleKey ?? "default") ?? week.orgDays;
  if (days.size === 0) return [];
  const out: string[] = [];
  let cursor = startOfDay(anchor);
  for (let i = 0; i < 120 && out.length < n; i += 1) {
    const iso = fmtDate(cursor);
    if (days.has(isoDowOf(cursor)) && !isHolidayOn(week, iso)) out.push(iso);
    cursor = addDays(cursor, -1);
  }
  return out.reverse();
}

/** How many SCHOOL days a parent has been waiting since `sinceIso`.
 *
 *  Wall-clock ageing cries wolf: a message sent Friday evening would
 *  read "3 days waiting" on Monday morning at a school that was shut for
 *  two of them. Counting only days the school actually runs — and never
 *  holidays — makes an overdue flag mean something.
 *
 *  0 = still the same school day it arrived on.
 */
export function schoolDaysWaiting(
  week: SchoolWeek,
  /** A timestamp (created_at), not a date. */
  sinceIso: string,
  /** Today's date on the SCHOOL's clock. */
  todayIso: string,
  tz: string,
): number {
  // sinceIso.slice(0,10) would be the UTC date, and todayIso is the
  // school's - so a message that arrived at 02:00 Monday in Karachi
  // (still Sunday in UTC) counted a day that had not passed. Convert the
  // timestamp on the same clock the comparison is made on.
  const from = startOfDay(new Date(`${todayInOrgTz(tz, new Date(sinceIso))}T12:00:00Z`));
  const to = startOfDay(new Date(`${todayIso}T12:00:00Z`));
  if (!(to > from)) return 0;
  const days = week.orgDays;
  if (days.size === 0) return 0;
  let n = 0;
  let cursor = addDays(from, 1); // the day it arrived does not count
  for (let i = 0; i < 400 && cursor <= to; i += 1) {
    const iso = fmtDate(cursor);
    if (days.has(isoDowOf(cursor)) && !isHolidayOn(week, iso)) n += 1;
    cursor = addDays(cursor, 1);
  }
  return n;
}
