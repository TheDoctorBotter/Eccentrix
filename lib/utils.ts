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
 * Convert a UTC date string (or Date) to America/Chicago timezone and format it.
 * Use this for ALL user-facing date display to avoid the off-by-one-day bug.
 */
export function formatLocalDate(
  utcDate: string | Date,
  formatStr: string = 'MM/dd/yyyy'
): string {
  const date = typeof utcDate === 'string' ? new Date(utcDate) : utcDate;
  const zoned = toZonedTime(date, CLINIC_TZ);
  return dateFnsFormat(zoned, formatStr);
}

/**
 * Convert a UTC date string to a Date object in the clinic's local timezone.
 * Use for comparisons like isSameDay, isToday, etc.
 */
export function toLocalDate(utcDate: string | Date): Date {
  const date = typeof utcDate === 'string' ? new Date(utcDate) : utcDate;
  return toZonedTime(date, CLINIC_TZ);
}

/**
 * Get "now" in the clinic's local timezone.
 */
export function localNow(): Date {
  return toZonedTime(new Date(), CLINIC_TZ);
}
