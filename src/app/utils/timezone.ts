/**
 * Timezone Utilities for Family Growth System
 * 
 * Handles timezone-aware date calculations to fix UTC day boundary issues.
 * Critical for prayer tracking, daily caps, and streak calculations.
 */

import { format, toZonedTime, fromZonedTime } from 'date-fns-tz';
import { startOfDay, endOfDay, parseISO } from 'date-fns';

/**
 * Get family's local "today" date string in YYYY-MM-DD format
 * 
 * @param timezone - IANA timezone (e.g., 'America/Toronto')
 * @returns Date string in family's local timezone
 * 
 * @example
 * // For Toronto family at 11:00 PM EST (4:00 AM UTC next day)
 * getTodayInTimezone('America/Toronto')
 * // Returns: "2026-02-22" (EST date, not UTC date)
 */
export function getTodayInTimezone(timezone: string = 'UTC'): string {
  const now = new Date();
  const zonedDate = toZonedTime(now, timezone);
  return format(zonedDate, 'yyyy-MM-dd', { timeZone: timezone });
}

/**
 * Get start of day in family's timezone as UTC Date object
 * 
 * @param dateString - Date in YYYY-MM-DD format
 * @param timezone - IANA timezone
 * @returns UTC Date object representing start of day in family timezone
 * 
 * @example
 * // For Toronto family, start of 2026-02-22
 * getStartOfDayInTimezone('2026-02-22', 'America/Toronto')
 * // Returns: 2026-02-22T05:00:00.000Z (midnight EST = 5am UTC)
 */
export function getStartOfDayInTimezone(dateString: string, timezone: string = 'UTC'): Date {
  const date = parseISO(dateString);
  const zonedDate = toZonedTime(date, timezone);
  const startOfDayZoned = startOfDay(zonedDate);
  return fromZonedTime(startOfDayZoned, timezone);
}

/**
 * Get end of day in family's timezone as UTC Date object
 * 
 * @param dateString - Date in YYYY-MM-DD format
 * @param timezone - IANA timezone
 * @returns UTC Date object representing end of day in family timezone
 */
export function getEndOfDayInTimezone(dateString: string, timezone: string = 'UTC'): Date {
  const date = parseISO(dateString);
  const zonedDate = toZonedTime(date, timezone);
  const endOfDayZoned = endOfDay(zonedDate);
  return fromZonedTime(endOfDayZoned, timezone);
}

/**
 * Check if a UTC timestamp falls on a specific date in family's timezone
 * 
 * @param timestamp - UTC timestamp (ISO string or Date)
 * @param targetDate - Target date in YYYY-MM-DD format
 * @param timezone - IANA timezone
 * @returns true if timestamp is on targetDate in family's timezone
 * 
 * @example
 * // Check if prayer claimed "today" in Toronto timezone
 * const claimed = new Date('2026-02-23T04:00:00Z'); // 11pm EST previous day
 * isDateInTimezone(claimed, '2026-02-22', 'America/Toronto')
 * // Returns: true (4am UTC = 11pm EST on Feb 22)
 */
export function isDateInTimezone(
  timestamp: Date | string,
  targetDate: string,
  timezone: string = 'UTC'
): boolean {
  const date = typeof timestamp === 'string' ? parseISO(timestamp) : timestamp;
  const zonedDate = toZonedTime(date, timezone);
  const dateStr = format(zonedDate, 'yyyy-MM-dd', { timeZone: timezone });
  return dateStr === targetDate;
}

/**
 * Format a UTC timestamp in family's local timezone
 * 
 * @param timestamp - UTC timestamp
 * @param timezone - IANA timezone
 * @param formatStr - date-fns format string
 * @returns Formatted string in family's timezone
 * 
 * @example
 * formatInTimezone(new Date(), 'America/Toronto', 'PPpp')
 * // Returns: "Feb 22, 2026, 11:30:00 PM" (EST time, not UTC)
 */
export function formatInTimezone(
  timestamp: Date | string,
  timezone: string = 'UTC',
  formatStr: string = 'PPpp'
): string {
  const date = typeof timestamp === 'string' ? parseISO(timestamp) : timestamp;
  const zonedDate = toZonedTime(date, timezone);
  return format(zonedDate, formatStr, { timeZone: timezone });
}

/**
 * Get the number of days between two dates in family's timezone
 * 
 * @param date1 - First date (YYYY-MM-DD or Date)
 * @param date2 - Second date (YYYY-MM-DD or Date)
 * @param timezone - IANA timezone
 * @returns Number of days between dates
 */
export function getDaysDifference(
  date1: Date | string,
  date2: Date | string,
  timezone: string = 'UTC'
): number {
  const d1 = typeof date1 === 'string' ? parseISO(date1) : date1;
  const d2 = typeof date2 === 'string' ? parseISO(date2) : date2;
  
  const zoned1 = toZonedTime(d1, timezone);
  const zoned2 = toZonedTime(d2, timezone);
  
  const start1 = startOfDay(zoned1);
  const start2 = startOfDay(zoned2);
  
  const diffTime = Math.abs(start2.getTime() - start1.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

/**
 * Check if two dates are consecutive days in family's timezone
 * 
 * @param date1 - First date
 * @param date2 - Second date
 * @param timezone - IANA timezone
 * @returns true if dates are consecutive
 */
export function areConsecutiveDays(
  date1: Date | string,
  date2: Date | string,
  timezone: string = 'UTC'
): boolean {
  return getDaysDifference(date1, date2, timezone) === 1;
}

/**
 * Get common timezone options for family setup
 */
export const COMMON_TIMEZONES = [
  { value: 'America/Toronto', label: 'Toronto (EST/EDT)', offset: 'UTC-5/-4' },
  { value: 'America/New_York', label: 'New York (EST/EDT)', offset: 'UTC-5/-4' },
  { value: 'America/Chicago', label: 'Chicago (CST/CDT)', offset: 'UTC-6/-5' },
  { value: 'America/Denver', label: 'Denver (MST/MDT)', offset: 'UTC-7/-6' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)', offset: 'UTC-8/-7' },
  { value: 'Europe/London', label: 'London (GMT/BST)', offset: 'UTC+0/+1' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)', offset: 'UTC+1/+2' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)', offset: 'UTC+4' },
  { value: 'Asia/Riyadh', label: 'Riyadh (AST)', offset: 'UTC+3' },
  { value: 'Asia/Karachi', label: 'Karachi (PKT)', offset: 'UTC+5' },
  { value: 'Asia/Kolkata', label: 'Mumbai/Delhi (IST)', offset: 'UTC+5:30' },
  { value: 'Asia/Dhaka', label: 'Dhaka (BST)', offset: 'UTC+6' },
  { value: 'Asia/Jakarta', label: 'Jakarta (WIB)', offset: 'UTC+7' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)', offset: 'UTC+8' },
  { value: 'Australia/Sydney', label: 'Sydney (AEDT/AEST)', offset: 'UTC+10/+11' },
];

/**
 * Get user's current timezone (browser detection)
 */
export function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/**
 * Validate timezone string (IANA timezone database)
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
