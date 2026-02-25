/**
 * Buckeye EMR — EDI 835 (Electronic Remittance Advice) Parser
 *
 * Parses incoming 835 files from TMHP (Texas Medicaid) to extract:
 *   - Payment information (check/EFT number, total payment, payment date)
 *   - Per-claim payment details (charged, paid, patient responsibility)
 *   - Adjustment codes (CO, PR, OA, PI, CR) with CARC reason codes
 *   - Denial reasons
 *   - Service-line-level payment breakdowns
 *
 * Handles standard ANSI X12 835 v5010A1 files with:
 *   - ISA/GS/ST envelope detection and delimiter auto-detection
 *   - Multiple claims per remittance
 *   - CAS adjustments at both claim and service line levels
 *   - SVC (service line) payment details
 *
 * @module parse835
 */

import type {
  Parsed835Result,
  RemittanceClaim,
  RemittanceServiceLine,
  RemittanceAdjustment,
  RemittanceAdjustmentReason,
} from './types';

// ============================================================================
// Delimiter Detection
// ============================================================================

/**
 * Detect X12 delimiters from the ISA segment header.
 *
 * The ISA segment has a fixed structure:
 *   - Character at position 3 is always the element separator
 *   - The segment terminator follows the 16th element
 *   - ISA16 is the component separator (1 character)
 *
 * @param raw - Raw EDI file content
 * @returns Detected delimiters
 */
function detectDelimiters(raw: string): {
  elementSep: string;
  segmentTerm: string;
  componentSep: string;
} {
  // Element separator is always at position 3 in ISA
  const elementSep = raw[3];

  // Split by element separator to find ISA16 (the 17th element, index 16)
  const elements = raw.split(elementSep);
  const isa16Raw = elements[16] || '';

  // ISA16 is exactly 1 character (the component separator)
  const componentSep = isa16Raw[0] || ':';

  // The segment terminator follows ISA16
  let segmentTerm = '~';
  const afterComponent = isa16Raw.substring(1);
  for (const ch of afterComponent) {
    if (ch === '~') { segmentTerm = '~'; break; }
    if (ch !== '\n' && ch !== '\r' && ch !== ' ') { segmentTerm = ch; break; }
  }

  return { elementSep, segmentTerm, componentSep };
}

// ============================================================================
// Tokenizer
// ============================================================================

/**
 * Tokenize raw 835 EDI content into an array of segments,
 * where each segment is an array of elements.
 *
 * @param raw - Raw EDI file content
 * @returns Array of tokenized segments and detected delimiters
 */
function tokenize(raw: string): {
  segments: string[][];
  elementSep: string;
  componentSep: string;
} {
  const { elementSep, segmentTerm, componentSep } = detectDelimiters(raw);

  // Normalize line endings
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split on segment terminator
  const rawSegments = normalized.split(segmentTerm);
  const segments: string[][] = [];

  for (const rawSeg of rawSegments) {
    const cleaned = rawSeg.replace(/\n/g, '').trim();
    if (cleaned.length === 0) continue;
    segments.push(cleaned.split(elementSep));
  }

  return { segments, elementSep, componentSep };
}

// ============================================================================
// Helper: safe element access
// ============================================================================

/** Safely get element at index from a segment, returning empty string if missing. */
function el(seg: string[], idx: number): string {
  return seg[idx] ?? '';
}

/** Parse a dollar amount string, returning 0 for invalid/empty. */
function parseAmount(val: string): number {
  if (!val) return 0;
  const num = parseFloat(val);
  return isNaN(num) ? 0 : num;
}

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Parse a raw 835 (Electronic Remittance Advice) EDI file into structured data.
 *
 * Extracts:
 *   - BPR: Payment method and total payment amount
 *   - TRN: Check/EFT trace number
 *   - DTM*405: Payment/production date
 *   - N1*PR: Payer identification
 *   - N1*PE: Payee identification
 *   - CLP: Per-claim payment details
 *   - CAS: Adjustments (contractual obligations, patient responsibility, denials)
 *   - SVC: Service-line-level payment breakdowns
 *
 * @param raw - The raw 835 EDI file content
 * @returns Parsed835Result with payment info, claims, and any errors
 */
export function parse835(raw: string): Parsed835Result {
  const errors: string[] = [];

  // Basic validation
  if (!raw || raw.trim().length === 0) {
    return { success: false, claims: [], errors: ['Empty EDI content'] };
  }

  const trimmed = raw.trim();
  if (!trimmed.startsWith('ISA')) {
    return { success: false, claims: [], errors: ['EDI content must start with ISA segment'] };
  }

  let tokenized: ReturnType<typeof tokenize>;
  try {
    tokenized = tokenize(trimmed);
  } catch {
    return { success: false, claims: [], errors: ['Failed to tokenize 835 content'] };
  }

  const { segments, componentSep } = tokenized;
  const segIds = segments.map((s) => s[0]);

  // Validate required segments
  for (const required of ['ISA', 'GS', 'ST', 'BPR', 'SE', 'GE', 'IEA']) {
    if (!segIds.includes(required)) {
      errors.push(`Missing required segment: ${required}`);
    }
  }

  // ST must be 835
  const stSeg = segments.find((s) => s[0] === 'ST');
  if (stSeg && el(stSeg, 1) !== '835') {
    errors.push(`Expected transaction set 835, got ${el(stSeg, 1)}`);
  }

  if (errors.length > 0) {
    return { success: false, claims: [], errors };
  }

  // --- Parse BPR (Payment Information) ---
  const bprSeg = segments.find((s) => s[0] === 'BPR');
  const totalPayment = bprSeg ? parseAmount(el(bprSeg, 2)) : undefined;

  // --- Parse TRN (Trace / Check Number) ---
  const trnSeg = segments.find((s) => s[0] === 'TRN');
  const checkNumber = trnSeg ? el(trnSeg, 2) : undefined;

  // --- Parse DTM*405 (Payment Date) ---
  let paymentDate: string | undefined;
  for (const seg of segments) {
    if (seg[0] === 'DTM' && el(seg, 1) === '405') {
      paymentDate = el(seg, 2);
      break;
    }
  }

  // --- Parse N1*PR (Payer Name) ---
  let payerName: string | undefined;
  let payerId: string | undefined;
  for (const seg of segments) {
    if (seg[0] === 'N1' && el(seg, 1) === 'PR') {
      payerName = el(seg, 2);
      payerId = el(seg, 4);
      break;
    }
  }

  // --- Parse N1*PE (Payee Name) ---
  let payeeName: string | undefined;
  for (const seg of segments) {
    if (seg[0] === 'N1' && el(seg, 1) === 'PE') {
      payeeName = el(seg, 2);
      break;
    }
  }

  // --- Parse Claims (CLP segments and their children) ---
  const claims = parseClaims(segments, componentSep);

  return {
    success: true,
    checkNumber,
    totalPayment,
    paymentDate,
    payerName,
    payerId,
    payeeName,
    claims,
    errors,
  };
}

// ============================================================================
// Claims Parsing
// ============================================================================

/**
 * Parse all CLP (Claim Payment) segments and their child segments.
 *
 * Each CLP marks the beginning of a claim payment block that includes:
 *   - CAS: Claim-level adjustments
 *   - NM1: Patient/subscriber names
 *   - SVC: Service line payments
 *   - DTM: Dates
 *
 * @param segments - All tokenized segments from the 835
 * @param componentSep - Component separator for composite elements
 * @returns Array of parsed RemittanceClaim objects
 */
function parseClaims(segments: string[][], componentSep: string): RemittanceClaim[] {
  const claims: RemittanceClaim[] = [];

  for (let i = 0; i < segments.length; i++) {
    if (segments[i][0] !== 'CLP') continue;

    // Find end of this claim (next CLP, PLB, or SE)
    let claimEnd = segments.length;
    for (let j = i + 1; j < segments.length; j++) {
      if (['CLP', 'PLB', 'SE'].includes(segments[j][0])) {
        claimEnd = j;
        break;
      }
    }

    const claimSegs = segments.slice(i, claimEnd);
    claims.push(parseSingleClaim(claimSegs, componentSep));
    i = claimEnd - 1;
  }

  return claims;
}

/**
 * Parse a single claim from its CLP segment and child segments.
 *
 * CLP segment elements:
 *   CLP01: Patient Control Number (our claim ID)
 *   CLP02: Claim Status Code (1=Processed, 4=Denied, 22=Reversal)
 *   CLP03: Total Charge Amount
 *   CLP04: Total Payment Amount
 *   CLP05: Patient Responsibility Amount
 *   CLP07: Payer Claim Control Number
 */
function parseSingleClaim(segments: string[][], componentSep: string): RemittanceClaim {
  const clp = segments[0];

  const claim: RemittanceClaim = {
    patientAccountNumber: el(clp, 1),
    claimStatus: el(clp, 2),
    totalCharged: parseAmount(el(clp, 3)),
    totalPaid: parseAmount(el(clp, 4)),
    patientResponsibility: parseAmount(el(clp, 5)),
    payerClaimControlNumber: el(clp, 7) || undefined,
    serviceLines: [],
    adjustments: [],
  };

  // Find where SVC segments start
  let svcStart = segments.length;
  for (let i = 1; i < segments.length; i++) {
    if (segments[i][0] === 'SVC') {
      svcStart = i;
      break;
    }
  }

  // Parse claim-level CAS segments (before SVC)
  for (let i = 1; i < svcStart; i++) {
    if (segments[i][0] === 'CAS') {
      claim.adjustments.push(parseCAS(segments[i]));
    }
  }

  // Parse service lines (SVC segments and their children)
  claim.serviceLines = parseServiceLines(segments.slice(svcStart), componentSep);

  return claim;
}

// ============================================================================
// Service Line Parsing
// ============================================================================

/**
 * Parse service line payment segments (SVC and children).
 *
 * SVC segment elements:
 *   SVC01: Composite Procedure Code (qualifier:code:mod1:mod2:...)
 *   SVC02: Line Item Charge Amount
 *   SVC03: Line Item Payment Amount
 *   SVC05: Units Paid
 */
function parseServiceLines(segments: string[][], componentSep: string): RemittanceServiceLine[] {
  const lines: RemittanceServiceLine[] = [];

  for (let i = 0; i < segments.length; i++) {
    if (segments[i][0] !== 'SVC') continue;

    // Find end of this service line
    let lineEnd = segments.length;
    for (let j = i + 1; j < segments.length; j++) {
      if (segments[j][0] === 'SVC') {
        lineEnd = j;
        break;
      }
    }

    const lineSegs = segments.slice(i, lineEnd);
    lines.push(parseSingleServiceLine(lineSegs, componentSep));
    i = lineEnd - 1;
  }

  return lines;
}

/**
 * Parse a single service line from SVC and child segments.
 */
function parseSingleServiceLine(segments: string[][], componentSep: string): RemittanceServiceLine {
  const svc = segments[0];

  // Parse composite procedure code: HC:97110:GP
  const procComposite = el(svc, 1);
  const procParts = procComposite.split(componentSep);
  const procedureCode = procParts[1] || procParts[0] || '';
  const modifiers = procParts.slice(2).filter(Boolean);

  const line: RemittanceServiceLine = {
    procedureCode,
    modifiers,
    chargedAmount: parseAmount(el(svc, 2)),
    paidAmount: parseAmount(el(svc, 3)),
    unitsPaid: el(svc, 5) ? parseFloat(el(svc, 5)) : undefined,
    adjustments: [],
  };

  // Parse child segments
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];

    if (seg[0] === 'CAS') {
      line.adjustments.push(parseCAS(seg));
    }

    if (seg[0] === 'DTM' && el(seg, 1) === '472') {
      line.serviceDate = el(seg, 2);
    }
  }

  return line;
}

// ============================================================================
// CAS (Adjustment) Parsing
// ============================================================================

/**
 * Parse a CAS (Claim Adjustment Segment).
 *
 * CAS segments contain adjustment group codes and up to 6 reason/amount/quantity triplets:
 *   CAS01: Claim Adjustment Group Code (CO, PR, OA, PI, CR)
 *   CAS02/03/04: Reason Code 1 / Amount 1 / Quantity 1
 *   CAS05/06/07: Reason Code 2 / Amount 2 / Quantity 2
 *   ... up to CAS17/18/19
 *
 * Common adjustment group codes for TMHP:
 *   CO = Contractual Obligation (amount TMHP won't pay per contract)
 *   PR = Patient Responsibility (copay, coinsurance, deductible)
 *   OA = Other Adjustment
 *   PI = Payer Initiated Reduction
 */
function parseCAS(seg: string[]): RemittanceAdjustment {
  const groupCode = el(seg, 1);
  const reasons: RemittanceAdjustmentReason[] = [];

  // Up to 6 triplets starting at element 2
  for (let idx = 2; idx <= 17; idx += 3) {
    const reasonCode = el(seg, idx);
    if (!reasonCode) break;

    reasons.push({
      reasonCode,
      amount: parseAmount(el(seg, idx + 1)),
      quantity: el(seg, idx + 2) ? parseFloat(el(seg, idx + 2)) : undefined,
    });
  }

  return { groupCode, reasons };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get a human-readable description for an 835 claim status code.
 *
 * @param statusCode - CLP02 claim status code
 * @returns Human-readable description
 */
export function getClaimStatusDescription(statusCode: string): string {
  const descriptions: Record<string, string> = {
    '1': 'Processed as Primary',
    '2': 'Processed as Secondary',
    '3': 'Processed as Tertiary',
    '4': 'Denied',
    '19': 'Processed as Primary, Forwarded',
    '20': 'Processed as Secondary, Forwarded',
    '21': 'Processed as Tertiary, Forwarded',
    '22': 'Reversal of Previous Payment',
    '23': 'Not Our Claim, Forwarded',
    '25': 'Rejected',
  };
  return descriptions[statusCode] || `Unknown Status (${statusCode})`;
}

/**
 * Get a human-readable description for a CAS adjustment group code.
 *
 * @param groupCode - CAS01 group code
 * @returns Human-readable description
 */
export function getAdjustmentGroupDescription(groupCode: string): string {
  const descriptions: Record<string, string> = {
    'CO': 'Contractual Obligation',
    'PR': 'Patient Responsibility',
    'OA': 'Other Adjustment',
    'PI': 'Payer Initiated Reduction',
    'CR': 'Corrections and Reversals',
  };
  return descriptions[groupCode] || `Unknown Group (${groupCode})`;
}

/**
 * Get a human-readable description for common CARC reason codes
 * frequently seen in TMHP/Texas Medicaid remittances.
 *
 * @param reasonCode - CARC adjustment reason code
 * @returns Human-readable description
 */
export function getReasonCodeDescription(reasonCode: string): string {
  const descriptions: Record<string, string> = {
    '1': 'Deductible Amount',
    '2': 'Coinsurance Amount',
    '3': 'Co-payment Amount',
    '4': 'Procedure code not compatible with modifier or modifier not expected',
    '5': 'Procedure code not compatible with diagnosis',
    '16': 'Claim/service lacks information or submission/billing error',
    '18': 'Exact duplicate claim/service',
    '22': 'Care may be covered by another payer per coordination of benefits',
    '23': 'Payment adjusted — charges applied to authorized amount',
    '27': 'Expenses incurred after coverage terminated',
    '29': 'Time limit for filing has expired',
    '45': 'Charge exceeds fee schedule/maximum allowable or contracted/legislated fee',
    '50': 'Non-covered service — not deemed medical necessity by payer',
    '96': 'Non-covered charge(s)',
    '97': 'Payment is included in the allowance for another service/procedure',
    '109': 'Claim/service not covered by this payer/contractor',
    '119': 'Benefit maximum for this time period or occurrence has been reached',
    '167': 'Diagnosis is not covered',
    '170': 'Payment adjusted because this procedure/service is not covered when performed at this type of facility',
    '197': 'Precertification/authorization/notification absent',
    '204': 'Service/equipment not covered by this payer',
    '242': 'Services not provided by network/primary care providers',
    'A1': 'Claim/service denied. At least one Remark Code must be provided',
    'A6': 'Prior hospitalization or 30 day transfer requirement not met',
    'B7': 'Provider not certified/eligible to be paid for this service',
    'B15': 'Payment/service adjusted. This procedure/service is not paid separately',
    'N130': 'Remainder is patient responsibility — not covered by plan benefit',
  };
  return descriptions[reasonCode] || `Reason Code ${reasonCode}`;
}
