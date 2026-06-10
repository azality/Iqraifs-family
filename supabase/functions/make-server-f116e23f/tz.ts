// Timezone helpers for school endpoints.
//
// Why this exists:
//   `new Date().toISOString().slice(0, 10)` returns the UTC date. For the
//   Pakistan pilot (Asia/Karachi, UTC+5) every day from 00:00–05:00 local
//   time, that's *yesterday*. F12 (Today's Diary off by 1) and F54-style
//   "is the report card published today" gating both stem from this.
//
//   Until we wire per-org timezones (orgs.settings.timezone), the school
//   pilot is single-country, so we hardcode Asia/Karachi as the default.
//   Sites that pass an explicit tz get treated as authoritative.
//
// Usage:
//   import { todayInOrgTz } from "./tz.ts";
//   const today = todayInOrgTz();              // "2026-06-09" in Karachi
//   const today = todayInOrgTz("Asia/Karachi"); // same
//
// IMPORTANT: use for "school day" decisions (today's attendance row,
// today's diary, auto-publish gate). For 30-day windows / cutoff math,
// UTC is fine — keep `toISOString().slice(0, 10)` and add a comment.

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

/** Convenience: today minus N days in the given tz, as YYYY-MM-DD. */
export function daysAgoInOrgTz(n: number, tz: string = DEFAULT_TZ, at: Date = new Date()): string {
  const shifted = new Date(at.getTime() - n * 86_400_000);
  return todayInOrgTz(tz, shifted);
}
