/**
 * Server-Side Timezone Utilities
 * 
 * Deno-compatible timezone helpers using Intl API
 * (date-fns-tz not available in Deno runtime)
 */

/**
 * Get today's date in family timezone (YYYY-MM-DD format)
 */
export function getTodayInTimezone(timezone: string = 'UTC'): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(now); // Returns YYYY-MM-DD
}

/**
 * Get date string for a given timestamp in family timezone
 */
export function getDateInTimezone(date: Date, timezone: string = 'UTC'): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date); // Returns YYYY-MM-DD
}

/**
 * Check if two dates are consecutive days in timezone
 */
export function areConsecutiveDays(date1: Date | string, date2: Date | string, timezone: string = 'UTC'): boolean {
  const d1 = typeof date1 === 'string' ? new Date(date1) : date1;
  const d2 = typeof date2 === 'string' ? new Date(date2) : date2;
  
  const str1 = getDateInTimezone(d1, timezone);
  const str2 = getDateInTimezone(d2, timezone);
  
  // Parse back to compare
  const parsed1 = new Date(str1);
  const parsed2 = new Date(str2);
  
  const diffTime = Math.abs(parsed2.getTime() - parsed1.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays === 1;
}

/**
 * Format timestamp in family timezone
 */
export function formatInTimezone(
  timestamp: Date | string,
  timezone: string = 'UTC',
  options: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short'
  }
): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const formatter = new Intl.DateTimeFormat('en-US', {
    ...options,
    timeZone: timezone
  });
  return formatter.format(date);
}

/**
 * Validate timezone string
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// v10: Day / week boundary helpers anchored to a family timezone.
//
// These return UTC `Date` instants that correspond to family-local midnight
// or end-of-day / end-of-week. Quest generation, dedup, and progress
// windows all use these so a "daily" quest really runs from
// 00:00:00 family-local → 23:59:59 family-local (e.g. 12:01 AM EST → 11:59
// PM EST), not from server UTC.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the timezone offset in minutes for `timezone` at instant `at`.
 * Positive = ahead of UTC (e.g. Asia/Karachi = +300). Negative = behind
 * UTC (e.g. America/New_York = -240 in DST, -300 in standard time).
 */
export function getTimezoneOffsetMinutes(
  timezone: string,
  at: Date = new Date()
): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    });
    const parts = fmt.formatToParts(at);
    const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT+00:00';
    // Examples: "GMT-04:00", "GMT+05:30", "GMT" (UTC), "GMT+0"
    const m = tzPart.match(/GMT(?:([+-])(\d{1,2})(?::?(\d{2}))?)?/);
    if (!m || !m[1]) return 0; // bare "GMT" → UTC
    const sign = m[1] === '-' ? -1 : 1;
    const hours = parseInt(m[2] || '0', 10);
    const mins = parseInt(m[3] || '0', 10);
    return sign * (hours * 60 + mins);
  } catch {
    return 0;
  }
}

/**
 * UTC instant corresponding to 00:00:00 of the family-local day that
 * contains `at`. Defaults to "now".
 *
 * Example: tz=America/New_York, at=2026-04-25T03:30:00Z (which is
 * 2026-04-24 23:30 EDT) → returns the UTC instant for 2026-04-24 00:00 EDT
 * = 2026-04-24T04:00:00Z.
 */
export function getStartOfDayInTimezone(
  timezone: string = 'UTC',
  at: Date = new Date()
): Date {
  const ymd = getDateInTimezone(at, timezone); // YYYY-MM-DD in family tz
  const utcMidnight = new Date(`${ymd}T00:00:00Z`);
  const offsetMin = getTimezoneOffsetMinutes(timezone, utcMidnight);
  return new Date(utcMidnight.getTime() - offsetMin * 60 * 1000);
}

/**
 * UTC instant for 23:59:59.999 family-local on the day containing `at`.
 */
export function getEndOfDayInTimezone(
  timezone: string = 'UTC',
  at: Date = new Date()
): Date {
  const start = getStartOfDayInTimezone(timezone, at);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

/**
 * UTC instant corresponding to 00:00:00 of the most recent Sunday in the
 * family timezone (Sunday is week-start to match the rest of the codebase,
 * which uses `now.getDay()` against a UTC clock).
 */
export function getStartOfWeekInTimezone(
  timezone: string = 'UTC',
  at: Date = new Date()
): Date {
  const todayStart = getStartOfDayInTimezone(timezone, at);
  // Compute weekday in family tz so we don't lose a day around the boundary.
  const weekdayFmt = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: timezone,
  });
  const weekday = weekdayFmt.format(todayStart);
  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dayIdx = dayMap[weekday] ?? 0;
  return new Date(todayStart.getTime() - dayIdx * 24 * 60 * 60 * 1000);
}

/**
 * UTC instant for 23:59:59.999 next Saturday family-local.
 */
export function getEndOfWeekInTimezone(
  timezone: string = 'UTC',
  at: Date = new Date()
): Date {
  const start = getStartOfWeekInTimezone(timezone, at);
  return new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
}

/**
 * Common timezones list (server-side validation)
 */
export const VALID_TIMEZONES = [
  'UTC',
  'America/Toronto',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Jakarta',
  'Asia/Singapore',
  'Australia/Sydney',
];
