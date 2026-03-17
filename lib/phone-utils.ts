/**
 * Phone number formatting utilities.
 * Display: (XXX) XXX-XXXX
 * Storage: +1XXXXXXXXXX
 */

/** Strip all non-digit characters from a phone string. */
export function stripPhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** Format a phone string for display as (XXX) XXX-XXXX. */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = stripPhone(phone);
  // Handle +1 prefix
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (local.length !== 10) return phone; // return as-is if not 10 digits
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

/** Format a phone string for storage as +1XXXXXXXXXX. */
export function formatPhoneForStorage(phone: string): string {
  const digits = stripPhone(phone);
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (local.length !== 10) return phone; // return as-is if not 10 digits
  return `+1${local}`;
}

/** Validate that a phone string contains exactly 10 digits. */
export function isValidPhone(phone: string): boolean {
  const digits = stripPhone(phone);
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return local.length === 10;
}

/** Format phone input on blur — display format for the input field. */
export function formatPhoneOnBlur(value: string): string {
  if (!value.trim()) return '';
  return formatPhoneDisplay(value);
}
