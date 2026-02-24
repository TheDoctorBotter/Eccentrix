/**
 * EDI X12 Utility Functions
 * Shared helpers for generating HIPAA-compliant X12 EDI files.
 */

// Standard X12 delimiters
export const ELEMENT_SEP = '*';
export const SEGMENT_TERM = '~';
export const COMPONENT_SEP = ':';

/**
 * Build a single X12 segment from an array of elements.
 * Trailing empty elements are preserved (required by spec).
 */
export function segment(id: string, ...elements: (string | number | null | undefined)[]): string {
  const parts = elements.map((el) => (el == null ? '' : String(el)));
  return `${id}${ELEMENT_SEP}${parts.join(ELEMENT_SEP)}${SEGMENT_TERM}`;
}

/**
 * Format a Date as YYYYMMDD for EDI date fields.
 */
export function ediDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/**
 * Format a Date as HHMM for EDI time fields.
 */
export function ediTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}${m}`;
}

/**
 * Pad/truncate a string to a fixed width. Right-pads with spaces.
 */
export function fixedWidth(val: string, width: number): string {
  return val.slice(0, width).padEnd(width, ' ');
}

/**
 * Left-pad a number with zeros.
 */
export function zeroPad(val: number | string, width: number): string {
  return String(val).padStart(width, '0');
}

/**
 * Generate a unique control number (9 digits for ISA, variable for GS/ST).
 */
export function generateControlNumber(): string {
  return zeroPad(Math.floor(Math.random() * 999999999) + 1, 9);
}

/**
 * Format a decimal amount for EDI (no decimal point, cents implied).
 * e.g. 125.50 => "12550", 45 => "4500"
 */
export function ediAmount(amount: number): string {
  return amount.toFixed(2).replace('.', '');
}

/**
 * Format a decimal amount with 2 decimal places for CLM segment.
 */
export function ediDecimal(amount: number): string {
  return amount.toFixed(2);
}

/**
 * Clean a string for EDI - remove special characters that could break parsing.
 */
export function ediClean(val: string | null | undefined): string {
  if (!val) return '';
  return val.replace(/[~*:^]/g, '').trim();
}

/**
 * Format NPI for EDI (10 digits).
 */
export function formatNPI(npi: string | null | undefined): string {
  if (!npi) return '';
  return npi.replace(/\D/g, '').padStart(10, '0').slice(0, 10);
}

/**
 * Format Tax ID (EIN) for EDI - digits only.
 */
export function formatTaxId(taxId: string | null | undefined): string {
  if (!taxId) return '';
  return taxId.replace(/\D/g, '');
}

/**
 * Count segments in an EDI document (for SE segment).
 */
export function countSegments(ediContent: string): number {
  return ediContent.split(SEGMENT_TERM).filter((s) => s.trim().length > 0).length;
}
