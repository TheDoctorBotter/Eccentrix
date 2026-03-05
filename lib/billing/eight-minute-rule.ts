/**
 * Medicare 8-Minute Rule Calculator
 *
 * Per CMS guidelines, timed CPT codes are billed in 15-minute increments
 * using the 8-minute rule:
 * - Less than 8 minutes: 0 units (do not bill)
 * - 8–22 minutes: 1 unit
 * - 23–37 minutes: 2 units
 * - 38–52 minutes: 3 units
 * - 53–67 minutes: 4 units
 * - 68–82 minutes: 5 units
 * - 83–97 minutes: 6 units
 * - 98–112 minutes: 7 units
 * - 113–127 minutes: 8 units
 * - For each additional 15 minutes: +1 unit
 *
 * ST evaluation codes (92521-92524, 92610, 92605, 92597, etc.) are UNTIMED
 * and must NEVER use the 8-minute rule.
 */

export interface EightMinuteRuleResult {
  units: number;
  minutes: number;
  /** Human-readable calculation string */
  calculation: string;
  /** Whether this code is eligible for the 8-minute rule */
  isEligible: boolean;
  /** Reason if not eligible */
  ineligibleReason?: string;
}

const MINUTE_RANGES: Array<{ units: number; min: number; max: number }> = [
  { units: 1, min: 8, max: 22 },
  { units: 2, min: 23, max: 37 },
  { units: 3, min: 38, max: 52 },
  { units: 4, min: 53, max: 67 },
  { units: 5, min: 68, max: 82 },
  { units: 6, min: 83, max: 97 },
  { units: 7, min: 98, max: 112 },
  { units: 8, min: 113, max: 127 },
];

/** ST evaluation codes that must never use the 8-minute rule */
const ST_UNTIMED_CODES = new Set([
  '92521', '92522', '92523', '92524', '92526',
  '92597', '92605', '92610',
]);

/**
 * Calculate billing units using the Medicare 8-minute rule.
 *
 * @param minutes - Total treatment minutes for this code
 * @param isTimed - Whether this is a timed code
 * @param cptCode - The CPT code (to check ST untimed codes)
 * @param discipline - PT, OT, or ST
 * @returns EightMinuteRuleResult with units and calculation details
 */
export function calculateEightMinuteRule(
  minutes: number,
  isTimed: boolean,
  cptCode?: string,
  discipline?: string,
): EightMinuteRuleResult {
  // ST evaluation codes are always untimed
  if (cptCode && ST_UNTIMED_CODES.has(cptCode)) {
    return {
      units: 1,
      minutes,
      calculation: `${cptCode} is an untimed ST code - billed as 1 unit regardless of time`,
      isEligible: false,
      ineligibleReason: 'ST evaluation codes are untimed and do not use the 8-minute rule',
    };
  }

  // Untimed codes get 1 unit
  if (!isTimed) {
    return {
      units: 1,
      minutes,
      calculation: `Untimed code - billed as 1 unit regardless of time`,
      isEligible: false,
      ineligibleReason: 'Untimed codes do not use the 8-minute rule',
    };
  }

  // Less than 8 minutes - do not bill
  if (minutes < 8) {
    return {
      units: 0,
      minutes,
      calculation: `${minutes} minutes < 8 minute minimum - do not bill`,
      isEligible: true,
    };
  }

  // Look up in the table
  for (const range of MINUTE_RANGES) {
    if (minutes >= range.min && minutes <= range.max) {
      return {
        units: range.units,
        minutes,
        calculation: `${minutes} minutes falls in ${range.min}-${range.max} minute range = ${range.units} unit${range.units > 1 ? 's' : ''} (8-minute rule)`,
        isEligible: true,
      };
    }
  }

  // Beyond the table: each additional 15 minutes adds 1 unit
  const units = Math.ceil(minutes / 15);
  return {
    units,
    minutes,
    calculation: `${minutes} minutes = ${units} units (${minutes} / 15 rounded up, 8-minute rule)`,
    isEligible: true,
  };
}

/**
 * Generate the source_key for idempotent charge creation.
 * Deterministic hash of visit_id + cpt_code + modifier_1 + modifier_2 + discipline + finalized_hash.
 */
export function generateSourceKey(params: {
  visit_id: string;
  cpt_code: string;
  modifier_1?: string | null;
  modifier_2?: string | null;
  discipline?: string | null;
  finalized_hash?: string | null;
}): string {
  const parts = [
    params.visit_id,
    params.cpt_code,
    params.modifier_1 || '',
    params.modifier_2 || '',
    params.discipline || 'PT',
    params.finalized_hash || '',
  ];
  return parts.join('|');
}
