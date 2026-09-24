// Recurring announcement scheduling, in one pure place (24 Sep 2026).
//
// "Last Friday of the month" style standing announcements. All math is
// done in Pakistan time (UTC+5, no DST), on dates - the instance then
// APPEARS lead_days before the occurrence at 07:00 PKT, and expires at
// the end of the occurrence day.

export type RecurrenceFreq = "weekly" | "monthly_first" | "monthly_last";

const PKT_OFFSET_MS = 5 * 3_600_000;

/** The wall-clock date in Pakistan for a given instant, as a UTC-noon
 *  Date (noon keeps day arithmetic away from midnight edges). */
function pktDateOf(instant: Date): Date {
  const shifted = new Date(instant.getTime() + PKT_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), 12));
}
const ymd = (d: Date): string => d.toISOString().slice(0, 10);

/** First date matching `weekday` in the month of `monthAnchor`. */
function firstWeekdayOfMonth(monthAnchor: Date, weekday: number): Date {
  const first = new Date(Date.UTC(monthAnchor.getUTCFullYear(), monthAnchor.getUTCMonth(), 1, 12));
  const shift = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(first.getTime() + shift * 86_400_000);
}
/** Last date matching `weekday` in the month of `monthAnchor`. */
function lastWeekdayOfMonth(monthAnchor: Date, weekday: number): Date {
  const last = new Date(Date.UTC(monthAnchor.getUTCFullYear(), monthAnchor.getUTCMonth() + 1, 0, 12));
  const shift = (last.getUTCDay() - weekday + 7) % 7;
  return new Date(last.getTime() - shift * 86_400_000);
}

/** The next occurrence date (YYYY-MM-DD, Pakistan calendar) STRICTLY
 *  after the PKT date of `after`. */
export function nextOccurrence(freq: RecurrenceFreq, weekday: number, after: Date): string {
  const day = pktDateOf(after);
  if (freq === "weekly") {
    const shift = ((weekday - day.getUTCDay() + 7) % 7) || 7;
    return ymd(new Date(day.getTime() + shift * 86_400_000));
  }
  for (let m = 0; m < 14; m++) {
    const anchor = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + m, 1, 12));
    const cand = freq === "monthly_first"
      ? firstWeekdayOfMonth(anchor, weekday)
      : lastWeekdayOfMonth(anchor, weekday);
    if (cand.getTime() > day.getTime()) return ymd(cand);
  }
  throw new Error("no occurrence found"); // unreachable
}

export interface NextSchedule {
  /** The date the instance is about (Pakistan calendar). */
  occurrence: string;
  /** When the instance appears in feeds: lead_days before the
   *  occurrence, at 07:00 PKT. Always in the future relative to `now`. */
  postAt: string;
  /** End of the occurrence day in Pakistan - the instance's expiry. */
  expiresAt: string;
}

/** The next occurrence whose POST moment is still ahead of `now` - so
 *  a rule created on the morning it would have posted rolls forward
 *  instead of firing instantly for a day already underway. */
export function nextSchedule(
  freq: RecurrenceFreq, weekday: number, leadDays: number, now: Date,
): NextSchedule {
  let after = now;
  for (let i = 0; i < 20; i++) {
    const occ = nextOccurrence(freq, weekday, after);
    const occNoon = new Date(`${occ}T12:00:00Z`);
    // 07:00 PKT = 02:00 UTC on the post date.
    const postDate = new Date(occNoon.getTime() - leadDays * 86_400_000);
    const postAt = new Date(`${ymd(postDate)}T02:00:00Z`);
    if (postAt.getTime() > now.getTime()) {
      return {
        occurrence: occ,
        postAt: postAt.toISOString(),
        // 23:59 PKT = 18:59 UTC on the occurrence day.
        expiresAt: new Date(`${occ}T18:59:00Z`).toISOString(),
      };
    }
    after = new Date(occNoon.getTime() + 86_400_000);
  }
  throw new Error("no postable occurrence found"); // unreachable
}
