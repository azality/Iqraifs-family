// Timezone helpers for school endpoints.
//
// Why this exists:
//   `new Date().toISOString().slice(0, 10)` returns the UTC date. For the
//   Pakistan pilot (Asia/Karachi, UTC+5) every day from 00:00–05:00 local
//   time, that's *yesterday*. F12 (Today's Diary off by 1) and F54-style
//   "is the report card published today" gating both stem from this.
//
//   Per-org timezones ARE wired now: orgTimezone(orgId) resolves
//   organizations.settings.timezone, falling back to the org's campus
//   timezone and only then to DEFAULT_TZ. Asia/Karachi remains the
//   default because the first school is Pakistani, NOT because the
//   product assumes Pakistan - a school anywhere sets its own and every
//   school-day decision follows it. Callers that already know the zone
//   pass it explicitly.
//
// Usage:
//   import { todayInOrgTz } from "./tz.ts";
//   const today = todayInOrgTz();              // "2026-06-09" in Karachi
//   const today = todayInOrgTz("Asia/Karachi"); // same
//
// IMPORTANT: use for "school day" decisions (today's attendance row,
// today's diary, auto-publish gate). For 30-day windows / cutoff math,
// UTC is fine — keep `toISOString().slice(0, 10)` and add a comment.

import { serviceRoleClient } from "./middleware.tsx";

const DEFAULT_TZ = "Asia/Karachi";

/** YYYY-MM-DD as it would read on a wall clock in the given timezone.
 *  Uses Intl.DateTimeFormat with the en-CA locale because en-CA's short
 *  date format is already YYYY-MM-DD — no manual parsing needed. */
export function todayInOrgTz(tz: string = DEFAULT_TZ, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** "HH:MM" as it would read on a wall clock in the given timezone.
 *  Same reason as todayInOrgTz: "has the first bell rung yet?" is a
 *  question about the school's clock, never the server's. */
export function nowTimeInOrgTz(tz: string = DEFAULT_TZ, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

/** A Date whose UTC calendar date equals the school's calendar date.
 *  The date helpers in schoolDashboard all read UTC fields, so anchoring
 *  a weekday walk on this makes them agree with the school's day. Noon
 *  keeps it clear of any hour-level edge. */
export function schoolDayAnchor(tz: string = DEFAULT_TZ, at: Date = new Date()): Date {
  return new Date(`${todayInOrgTz(tz, at)}T12:00:00Z`);
}

/** Minutes that `tz` is ahead of UTC at the given instant. Computed from
 *  Intl rather than a constant so DST is handled: a school in a zone that
 *  shifts twice a year would otherwise be an hour out for half the year,
 *  which hardcoded offset arithmetic (Date.now() + 5 * 3600e3) cannot do. */
export function tzOffsetMinutes(at: Date, tz: string = DEFAULT_TZ): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  // Read the wall-clock reading back as if it were UTC; the gap is the offset.
  const asIfUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour") === 24 ? 0 : n("hour"), n("minute"), n("second"));
  return Math.round((asIfUtc - at.getTime()) / 60000);
}

/** The UTC instants bounding one local calendar day, for querying
 *  timestamp columns ("what was recorded today?"). */
export function zonedDayRangeUtc(
  dateIso: string,
  tz: string = DEFAULT_TZ,
): { startUtc: string; endUtc: string } {
  // Offset sampled at local noon: unambiguous even on a DST changeover,
  // where midnight itself may not exist or may happen twice.
  const noonGuess = new Date(`${dateIso}T12:00:00Z`);
  const offsetMin = tzOffsetMinutes(noonGuess, tz);
  const startMs = Date.parse(`${dateIso}T00:00:00Z`) - offsetMin * 60000;
  return {
    startUtc: new Date(startMs).toISOString(),
    endUtc: new Date(startMs + 86400000).toISOString(),
  };
}

/** Convenience: today minus N days in the given tz, as YYYY-MM-DD. */
export function daysAgoInOrgTz(n: number, tz: string = DEFAULT_TZ, at: Date = new Date()): string {
  const shifted = new Date(at.getTime() - n * 86_400_000);
  return todayInOrgTz(tz, shifted);
}

// ── Per-org timezone ─────────────────────────────────────────────────
// Every "is it a school day", "has the first bell rung", "was this
// marked today" question is asked on the SCHOOL's clock. Hardcoding one
// country makes the product an anomaly built for its first customer, so
// the zone is a property of the organization.
//
// Resolution order, first hit wins:
//   1. organizations.settings.timezone  - what the school set
//   2. its earliest campus's timezone   - schools created via campuses
//   3. DEFAULT_TZ                       - a fresh org that never chose

/** An unknown zone must not take dates down with it. */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Resolved zones are stable for the life of an isolate; a school does not
// move country mid-request.
const tzCache = new Map<string, string>();

export async function orgTimezone(orgId: string): Promise<string> {
  const cached = tzCache.get(orgId);
  if (cached) return cached;

  let resolved = DEFAULT_TZ;
  try {
    const { data: org } = await serviceRoleClient
      .from("organizations")
      .select("settings")
      .eq("id", orgId)
      .maybeSingle();
    const fromSettings = (org as any)?.settings?.timezone;
    if (isValidTimeZone(fromSettings)) {
      resolved = fromSettings;
    } else {
      const { data: campus } = await serviceRoleClient
        .from("campuses")
        .select("timezone")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (isValidTimeZone((campus as any)?.timezone)) {
        resolved = (campus as any).timezone;
      }
    }
  } catch {
    // A lookup failure must never break a dashboard; the default stands.
  }

  tzCache.set(orgId, resolved);
  return resolved;
}

/** Test seam / admin change: drop a cached zone so the next call re-reads. */
export function forgetOrgTimezone(orgId: string): void {
  tzCache.delete(orgId);
}
