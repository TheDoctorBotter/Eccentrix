import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format as dateFnsFormat } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Clinic timezone — McAllen, TX */
const CLINIC_TZ = 'America/Chicago';

/**
 * Safely parse a date value. Returns null if the value is falsy or invalid.
 */
export function safeDate(value: unknown): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value as string | number);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Safely format a date value. Returns the fallback string if the value is falsy or invalid.
 */
export function safeDateFormat(value: unknown, fallback: string = 'N/A'): string {
  const d = safeDate(value);
  if (!d) return fallback;
  return d.toLocaleDateString('en-US', { timeZone: 'America/Chicago' });
}

/**
 * Convert a UTC date string (or Date) to America/Chicago timezone and format it.
 * Use this for ALL user-facing date display to avoid the off-by-one-day bug.
 * Returns fallback string for null/undefined/invalid dates.
 */
export function formatLocalDate(
  utcDate: string | Date | null | undefined,
  formatStr: string = 'MM/dd/yyyy',
  fallback: string = '-'
): string {
  if (!utcDate) return fallback;
  const date = typeof utcDate === 'string' ? new Date(utcDate) : utcDate;
  if (isNaN(date.getTime())) return fallback;
  const zoned = toZonedTime(date, CLINIC_TZ);
  return dateFnsFormat(zoned, formatStr);
}

/**
 * Convert a UTC date string to a Date object in the clinic's local timezone.
 * Use for comparisons like isSameDay, isToday, etc.
 * Returns current time for invalid dates to avoid crashing callers.
 */
export function toLocalDate(utcDate: string | Date): Date {
  const date = typeof utcDate === 'string' ? new Date(utcDate) : utcDate;
  if (isNaN(date.getTime())) return toZonedTime(new Date(), CLINIC_TZ);
  return toZonedTime(date, CLINIC_TZ);
}

/**
 * Get "now" in the clinic's local timezone.
 */
export function localNow(): Date {
  return toZonedTime(new Date(), CLINIC_TZ);
}

/**
 * Check if a value can be parsed into a valid Date.
 */
export function isValidDate(value: unknown): boolean {
  if (!value) return false;
  const d = new Date(value as string | number);
  return !isNaN(d.getTime());
}

/**
 * Safely get a timestamp from a date value, for sorting and comparisons.
 * Invalid or missing dates return the fallback (defaults to MAX_SAFE_INTEGER
 * so they sort to the bottom).
 */
export function safeDateTimestamp(
  value: unknown,
  fallback: number = Number.MAX_SAFE_INTEGER
): number {
  if (!value) return fallback;
  const d = new Date(value as string | number);
  return isNaN(d.getTime()) ? fallback : d.getTime();
}
