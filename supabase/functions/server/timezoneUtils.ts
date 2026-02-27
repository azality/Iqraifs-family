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
