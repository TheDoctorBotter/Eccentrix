/**
 * Buckeye EMR — ANSI X12 837P Professional Claim Generator
 * Version: 005010X222A1
 *
 * Generates a fully compliant 837P EDI file for submitting physical therapy
 * claims directly to TMHP (Texas Medicaid & Healthcare Partnership) via
 * their EDI Gateway.
 *
 * Segment order follows the X12 5010 005010X222A1 implementation guide:
 *   ISA → GS → ST → BHT → NM1/PER (Submitter) → NM1 (Receiver) →
 *   HL (Billing) → NM1/N3/N4/REF (Billing Provider) →
 *   HL (Subscriber) → SBR → NM1/N3/N4/DMG (Patient) → NM1 (Payer) →
 *   CLM → DTP → HI → NM1 (Rendering) → SV1/DTP (Service Lines) →
 *   SE → GE → IEA
 *
 * @module generate837P
 */

import type {
  Claim837PInput,
  ValidationError,
  GenerationResult,
} from './types';

// ============================================================================
// Constants — X12 Delimiters for TMHP
// ============================================================================

/** Element separator — separates data elements within a segment. */
const ELEMENT_SEP = '*';

/** Segment terminator — marks end of each segment. */
const SEGMENT_TERM = '~';

/** Component separator — separates sub-elements within composite elements. */
const COMPONENT_SEP = ':';

/** Repetition separator — used in ISA11 for X12 version 5010. */
const REPETITION_SEP = '^';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build an X12 segment string from its ID and elements.
 * Elements are joined with the element separator and terminated with ~.
 *
 * @param id - The segment identifier (e.g., "ISA", "NM1", "CLM")
 * @param elements - Data elements for the segment
 * @returns The complete segment string (e.g., "NM1*41*2*CLINIC NAME~")
 */
function seg(id: string, ...elements: (string | number | undefined | null)[]): string {
  const parts = elements.map((el) => (el == null ? '' : String(el)));
  return `${id}${ELEMENT_SEP}${parts.join(ELEMENT_SEP)}${SEGMENT_TERM}`;
}

/**
 * Format a YYYY-MM-DD date string to CCYYMMDD (8-digit EDI date).
 * Also accepts Date objects.
 *
 * @param d - Date in "YYYY-MM-DD" format or a Date object
 * @returns 8-digit date string (e.g., "20260225")
 */
function ediDate(d: string | Date): string {
  if (d instanceof Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }
  // "YYYY-MM-DD" → "YYYYMMDD"
  return d.replace(/-/g, '');
}

/**
 * Format a Date object to HHMM (4-digit EDI time).
 *
 * @param d - Date object
 * @returns 4-digit time string (e.g., "1430")
 */
function ediTime(d: Date): string {
  return String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
}

/**
 * Right-pad a string to a fixed width with spaces. Truncates if longer.
 * Required for ISA fixed-width fields.
 *
 * @param val - Input string
 * @param width - Target width
 * @returns Fixed-width string
 */
function fixedWidth(val: string, width: number): string {
  return val.slice(0, width).padEnd(width, ' ');
}

/**
 * Left-pad a number/string with zeros to a specified width.
 *
 * @param val - Input value
 * @param width - Minimum width
 * @returns Zero-padded string
 */
function zeroPad(val: string | number, width: number): string {
  return String(val).padStart(width, '0');
}

/**
 * Format a dollar amount to 2 decimal places for EDI.
 *
 * @param amount - Dollar amount
 * @returns Formatted string (e.g., "125.00")
 */
function dollars(amount: number): string {
  return amount.toFixed(2);
}

/**
 * Strip special characters that could break X12 parsing.
 * Removes *, ~, :, and ^ characters.
 *
 * @param val - Input string
 * @returns Cleaned string safe for EDI
 */
function clean(val: string | null | undefined): string {
  if (!val) return '';
  return val.replace(/[~*:^]/g, '').trim();
}

/**
 * Format an NPI to exactly 10 digits.
 *
 * @param npi - National Provider Identifier
 * @returns 10-digit NPI string
 */
function fmtNpi(npi: string): string {
  return npi.replace(/\D/g, '').padStart(10, '0').slice(0, 10);
}

/**
 * Format a Tax ID (EIN) to digits only.
 *
 * @param taxId - Employer Identification Number
 * @returns Digits-only string
 */
function fmtTaxId(taxId: string): string {
  return taxId.replace(/\D/g, '');
}

/**
 * Generate a random control number of specified digit width.
 *
 * @param width - Number of digits
 * @returns Zero-padded random number string
 */
function controlNumber(width: number): string {
  const max = Math.pow(10, width) - 1;
  return zeroPad(Math.floor(Math.random() * max) + 1, width);
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate all required fields in the claim input before generation.
 * Returns an array of ValidationError objects. Errors with severity "error"
 * prevent 837P generation; "warning" severity is informational only.
 *
 * Validates:
 *   - Submitter info (name, ID, contact)
 *   - Billing provider (NPI format, Tax ID, taxonomy, address)
 *   - Rendering provider (NPI, name, taxonomy)
 *   - Patient demographics (name, DOB, gender, Medicaid ID, address)
 *   - Claim details (claim ID, charges, diagnosis codes, POS)
 *   - Service lines (CPT codes, units, charges, diagnosis pointers, dates)
 *   - Line total vs. claim total consistency
 *
 * @param input - The claim data to validate
 * @returns Array of validation errors/warnings
 */
export function validateClaim(input: Claim837PInput): ValidationError[] {
  const errors: ValidationError[] = [];

  const NPI_RE = /^\d{10}$/;
  const TAXID_RE = /^\d{9}$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const CPT_RE = /^[0-9A-Z]{5}$/;
  const MOD_RE = /^[A-Z0-9]{2}$/;
  const STATE_RE = /^[A-Z]{2}$/;

  // --- Submitter ---
  if (!input.submitter?.name?.trim()) {
    errors.push({ field: 'submitter.name', message: 'Submitter name is required', severity: 'error' });
  }
  if (!input.submitter?.submitterId?.trim()) {
    errors.push({ field: 'submitter.submitterId', message: 'Submitter ID is required', severity: 'error' });
  }
  if (!input.submitter?.contactName?.trim()) {
    errors.push({ field: 'submitter.contactName', message: 'Submitter contact name is required', severity: 'error' });
  }
  if (!input.submitter?.contactPhone || input.submitter.contactPhone.replace(/\D/g, '').length < 10) {
    errors.push({ field: 'submitter.contactPhone', message: 'Submitter contact phone must be at least 10 digits', severity: 'error' });
  }

  // --- Billing Provider ---
  const bp = input.billingProvider;
  if (!bp) {
    errors.push({ field: 'billingProvider', message: 'Billing provider is required', severity: 'error' });
  } else {
    if (!bp.npi || !NPI_RE.test(bp.npi.replace(/\D/g, ''))) {
      errors.push({ field: 'billingProvider.npi', message: 'Billing provider NPI must be 10 digits', severity: 'error' });
    }
    if (!bp.taxId || !TAXID_RE.test(bp.taxId.replace(/\D/g, ''))) {
      errors.push({ field: 'billingProvider.taxId', message: 'Billing provider Tax ID (EIN) must be 9 digits', severity: 'error' });
    }
    if (!bp.taxonomyCode?.trim()) {
      errors.push({ field: 'billingProvider.taxonomyCode', message: 'Billing provider taxonomy code is required', severity: 'error' });
    }
    if (!bp.name?.trim()) {
      errors.push({ field: 'billingProvider.name', message: 'Billing provider name is required', severity: 'error' });
    }
    if (!bp.address1?.trim()) {
      errors.push({ field: 'billingProvider.address1', message: 'Billing provider street address is required', severity: 'error' });
    }
    if (!bp.city?.trim()) {
      errors.push({ field: 'billingProvider.city', message: 'Billing provider city is required', severity: 'error' });
    }
    if (!bp.state || !STATE_RE.test(bp.state)) {
      errors.push({ field: 'billingProvider.state', message: 'Billing provider state must be a 2-letter code', severity: 'error' });
    }
    if (!bp.zip?.trim()) {
      errors.push({ field: 'billingProvider.zip', message: 'Billing provider ZIP code is required', severity: 'error' });
    }
  }

  // --- Rendering Provider ---
  const rp = input.renderingProvider;
  if (!rp) {
    errors.push({ field: 'renderingProvider', message: 'Rendering provider is required', severity: 'error' });
  } else {
    if (!rp.npi || !NPI_RE.test(rp.npi.replace(/\D/g, ''))) {
      errors.push({ field: 'renderingProvider.npi', message: 'Rendering provider NPI must be 10 digits', severity: 'error' });
    }
    if (!rp.lastName?.trim()) {
      errors.push({ field: 'renderingProvider.lastName', message: 'Rendering provider last name is required', severity: 'error' });
    }
    if (!rp.firstName?.trim()) {
      errors.push({ field: 'renderingProvider.firstName', message: 'Rendering provider first name is required', severity: 'error' });
    }
    if (!rp.taxonomyCode?.trim()) {
      errors.push({ field: 'renderingProvider.taxonomyCode', message: 'Rendering provider taxonomy code is required', severity: 'error' });
    }
  }

  // --- Patient / Subscriber ---
  const pt = input.patient;
  if (!pt) {
    errors.push({ field: 'patient', message: 'Patient information is required', severity: 'error' });
  } else {
    if (!pt.firstName?.trim()) {
      errors.push({ field: 'patient.firstName', message: 'Patient first name is required', severity: 'error' });
    }
    if (!pt.lastName?.trim()) {
      errors.push({ field: 'patient.lastName', message: 'Patient last name is required', severity: 'error' });
    }
    if (!pt.dateOfBirth || !DATE_RE.test(pt.dateOfBirth)) {
      errors.push({ field: 'patient.dateOfBirth', message: 'Patient DOB must be YYYY-MM-DD', severity: 'error' });
    }
    if (!pt.gender || !['M', 'F', 'U'].includes(pt.gender)) {
      errors.push({ field: 'patient.gender', message: 'Patient gender must be M, F, or U', severity: 'error' });
    }
    if (!pt.medicaidId?.trim()) {
      errors.push({ field: 'patient.medicaidId', message: 'Medicaid ID is required', severity: 'error' });
    }
    if (!pt.address1?.trim()) {
      errors.push({ field: 'patient.address1', message: 'Patient street address is required', severity: 'error' });
    }
    if (!pt.city?.trim()) {
      errors.push({ field: 'patient.city', message: 'Patient city is required', severity: 'error' });
    }
    if (!pt.state || !STATE_RE.test(pt.state)) {
      errors.push({ field: 'patient.state', message: 'Patient state must be a 2-letter code', severity: 'error' });
    }
    if (!pt.zip?.trim()) {
      errors.push({ field: 'patient.zip', message: 'Patient ZIP code is required', severity: 'error' });
    }
  }

  // --- Claim Details ---
  const cl = input.claim;
  if (!cl) {
    errors.push({ field: 'claim', message: 'Claim details are required', severity: 'error' });
  } else {
    if (!cl.claimId?.trim()) {
      errors.push({ field: 'claim.claimId', message: 'Claim ID is required', severity: 'error' });
    }
    if (typeof cl.totalCharge !== 'number' || cl.totalCharge <= 0) {
      errors.push({ field: 'claim.totalCharge', message: 'Total charge must be a positive dollar amount', severity: 'error' });
    }
    if (!cl.placeOfService?.trim()) {
      errors.push({ field: 'claim.placeOfService', message: 'Place of service code is required', severity: 'error' });
    }
    if (!cl.dateOfService || !DATE_RE.test(cl.dateOfService)) {
      errors.push({ field: 'claim.dateOfService', message: 'Claim date of service must be YYYY-MM-DD', severity: 'error' });
    }
    if (!cl.diagnosisCodes || cl.diagnosisCodes.length === 0) {
      errors.push({ field: 'claim.diagnosisCodes', message: 'At least one ICD-10 diagnosis code is required', severity: 'error' });
    }
    if (cl.diagnosisCodes && cl.diagnosisCodes.length > 12) {
      errors.push({ field: 'claim.diagnosisCodes', message: 'Maximum 12 diagnosis codes per claim', severity: 'error' });
    }
  }

  // --- Service Lines ---
  if (!input.serviceLines || input.serviceLines.length === 0) {
    errors.push({ field: 'serviceLines', message: 'At least one service line is required', severity: 'error' });
  } else {
    // Check line totals match claim total
    const lineTotal = input.serviceLines.reduce((sum, l) => sum + l.chargeAmount, 0);
    if (cl && Math.abs(lineTotal - cl.totalCharge) > 0.01) {
      errors.push({
        field: 'serviceLines',
        message: `Service line charges ($${lineTotal.toFixed(2)}) do not match claim total ($${cl.totalCharge.toFixed(2)})`,
        severity: 'warning',
      });
    }

    input.serviceLines.forEach((line, idx) => {
      const p = `serviceLines[${idx}]`;

      if (!line.cptCode || !CPT_RE.test(line.cptCode)) {
        errors.push({ field: `${p}.cptCode`, message: `Line ${idx + 1}: CPT code must be 5 alphanumeric characters`, severity: 'error' });
      }
      if (typeof line.chargeAmount !== 'number' || line.chargeAmount <= 0) {
        errors.push({ field: `${p}.chargeAmount`, message: `Line ${idx + 1}: Charge amount must be positive`, severity: 'error' });
      }
      if (typeof line.units !== 'number' || line.units <= 0) {
        errors.push({ field: `${p}.units`, message: `Line ${idx + 1}: Units must be positive`, severity: 'error' });
      }
      if (!line.dateOfService || !DATE_RE.test(line.dateOfService)) {
        errors.push({ field: `${p}.dateOfService`, message: `Line ${idx + 1}: Date of service must be YYYY-MM-DD`, severity: 'error' });
      }
      if (!line.icdPointers || line.icdPointers.length === 0) {
        errors.push({ field: `${p}.icdPointers`, message: `Line ${idx + 1}: At least one diagnosis pointer is required`, severity: 'error' });
      } else {
        if (line.icdPointers.length > 4) {
          errors.push({ field: `${p}.icdPointers`, message: `Line ${idx + 1}: Maximum 4 diagnosis pointers`, severity: 'error' });
        }
        if (cl?.diagnosisCodes) {
          line.icdPointers.forEach((ptr) => {
            if (ptr < 1 || ptr > cl.diagnosisCodes.length) {
              errors.push({ field: `${p}.icdPointers`, message: `Line ${idx + 1}: Pointer ${ptr} exceeds diagnosis count (${cl.diagnosisCodes.length})`, severity: 'error' });
            }
          });
        }
      }
      if (line.modifiers) {
        if (line.modifiers.length > 4) {
          errors.push({ field: `${p}.modifiers`, message: `Line ${idx + 1}: Maximum 4 modifiers`, severity: 'error' });
        }
        line.modifiers.forEach((mod, mi) => {
          if (!MOD_RE.test(mod)) {
            errors.push({ field: `${p}.modifiers[${mi}]`, message: `Line ${idx + 1}: Modifier "${mod}" must be 2 alphanumeric characters`, severity: 'error' });
          }
        });
      }
    });
  }

  return errors;
}

// ============================================================================
// Main Generator
// ============================================================================

/**
 * Generate a complete ANSI X12 837P v5010A1 EDI file from structured claim data.
 *
 * This function:
 *   1. Validates all required fields
 *   2. Generates unique control numbers for ISA/GS/ST
 *   3. Builds all required segments in 005010X222A1 order
 *   4. Returns both a compact transmission version and a formatted readable version
 *
 * All monetary amounts in the input are in DOLLARS (not cents).
 *
 * @param input - Complete claim data conforming to Claim837PInput
 * @returns GenerationResult with EDI content, control numbers, errors, and segment count
 */
export function generate837P(input: Claim837PInput): GenerationResult {
  // Step 1: Validate
  const errors = validateClaim(input);
  const hasErrors = errors.some((e) => e.severity === 'error');

  const emptyControls = { isa: '', gs: '', st: '' };

  if (hasErrors) {
    return {
      success: false,
      errors,
      controlNumbers: emptyControls,
      segmentCount: 0,
    };
  }

  // Step 2: Generate control numbers
  const isaCtrl = controlNumber(9); // ISA13: 9 digits
  const gsCtrl = controlNumber(6);  // GS06: up to 9 digits
  const stCtrl = controlNumber(4);  // ST02: 4 digits

  const now = new Date();
  const { submitter, billingProvider, renderingProvider, patient, claim, serviceLines } = input;

  // Collect transaction segments (ST through SE) for segment counting
  const txn: string[] = [];

  // ========================================================================
  // ST - Transaction Set Header
  // Identifies this as an 837 transaction using the 5010A1 implementation.
  // ST01: Transaction Set Identifier Code (837 = Health Care Claim)
  // ST02: Transaction Set Control Number (must match SE02)
  // ST03: Implementation Convention Reference
  // ========================================================================
  txn.push(seg('ST', '837', stCtrl, '005010X222A1'));

  // ========================================================================
  // BHT - Beginning of Hierarchical Transaction
  // Sets the context for the entire transaction set.
  // BHT01: Hierarchical Structure Code (0019 = standard 837 structure)
  // BHT02: Transaction Set Purpose Code (00 = Original)
  // BHT03: Reference Identification (originator's claim reference)
  // BHT04: Transaction Set Creation Date
  // BHT05: Transaction Set Creation Time
  // BHT06: Transaction Type Code (CH = Chargeable)
  // ========================================================================
  txn.push(seg('BHT', '0019', '00', clean(claim.claimId).slice(0, 30), ediDate(now), ediTime(now), 'CH'));

  // ========================================================================
  // Loop 1000A — Submitter Name
  // Identifies who is submitting this transaction to the receiver.
  // NM1*41: Entity Identifier Code (41 = Submitter)
  // NM1*02: Entity Type Qualifier (2 = Non-Person Entity / Organization)
  // NM1*03: Organization Name
  // NM1*08: Identification Code Qualifier (46 = ETIN)
  // NM1*09: Submitter Identifier
  // ========================================================================
  txn.push(seg('NM1', '41', '2', clean(submitter.name), '', '', '', '', '46', submitter.submitterId));

  // ========================================================================
  // PER - Submitter EDI Contact Information
  // Contact information for the entity submitting the transaction.
  // PER01: Contact Function Code (IC = Information Contact)
  // PER02: Contact Name
  // PER03: Communication Number Qualifier (TE = Telephone)
  // PER04: Telephone Number
  // PER05: Communication Number Qualifier (EM = Email, optional)
  // PER06: Email Address (optional)
  // ========================================================================
  const perElements: (string | undefined)[] = [
    'IC',
    clean(submitter.contactName),
    'TE',
    submitter.contactPhone.replace(/\D/g, ''),
  ];
  if (submitter.contactEmail) {
    perElements.push('EM', submitter.contactEmail);
  }
  txn.push(seg('PER', ...perElements));

  // ========================================================================
  // Loop 1000B — Receiver Name
  // Identifies TMHP as the intended receiver of this transaction.
  // NM1*40: Entity Identifier Code (40 = Receiver)
  // NM1*02: Entity Type Qualifier (2 = Non-Person)
  // NM1*03: Receiver Name (TMHP)
  // NM1*08: Identification Code Qualifier (46 = ETIN)
  // NM1*09: Receiver Identifier (TMHP payer ID)
  // ========================================================================
  txn.push(seg('NM1', '40', '2', 'TMHP', '', '', '', '', '46', '330897513'));

  // ========================================================================
  // Loop 2000A — Billing Provider Hierarchical Level
  // HL segment establishes the billing provider as the top of the hierarchy.
  // HL01: Hierarchical ID Number (1 = first level)
  // HL02: Hierarchical Parent ID Number (blank — no parent)
  // HL03: Hierarchical Level Code (20 = Information Source / Billing Provider)
  // HL04: Hierarchical Child Code (1 = has child levels)
  // ========================================================================
  txn.push(seg('HL', '1', '', '20', '1'));

  // ========================================================================
  // PRV - Billing Provider Specialty Information
  // Provider taxonomy code identifying the provider's specialty.
  // PRV01: Provider Code (BI = Billing)
  // PRV02: Reference Identification Qualifier (PXC = Health Care Provider Taxonomy Code)
  // PRV03: Taxonomy Code (e.g., 225100000X = Physical Therapist)
  // ========================================================================
  txn.push(seg('PRV', 'BI', 'PXC', billingProvider.taxonomyCode));

  // ========================================================================
  // Loop 2010AA — Billing Provider Name, Address, and Tax ID
  // NM1*85: Billing Provider
  // NM1*02: Entity Type (2 = Non-Person / Organization)
  // NM1*03: Organization Name
  // NM1*08: ID Code Qualifier (XX = NPI)
  // NM1*09: NPI
  // ========================================================================
  txn.push(seg('NM1', '85', '2', clean(billingProvider.name), '', '', '', '', 'XX', fmtNpi(billingProvider.npi)));

  // N3 - Billing Provider Address
  if (billingProvider.address2) {
    txn.push(seg('N3', clean(billingProvider.address1), clean(billingProvider.address2)));
  } else {
    txn.push(seg('N3', clean(billingProvider.address1)));
  }

  // N4 - Billing Provider City, State, ZIP
  txn.push(seg('N4', clean(billingProvider.city), billingProvider.state, billingProvider.zip.replace(/\D/g, '')));

  // REF*EI - Billing Provider Tax Identification Number
  // REF01: Reference Identification Qualifier (EI = Employer's Identification Number)
  // REF02: Tax ID (EIN, digits only)
  txn.push(seg('REF', 'EI', fmtTaxId(billingProvider.taxId)));

  // ========================================================================
  // Loop 2000B — Subscriber Hierarchical Level
  // HL segment for the subscriber (Medicaid beneficiary).
  // HL01: Hierarchical ID Number (2)
  // HL02: Hierarchical Parent ID Number (1 = billing provider)
  // HL03: Hierarchical Level Code (22 = Subscriber)
  // HL04: Hierarchical Child Code (0 = no dependents / patient is subscriber)
  // ========================================================================
  txn.push(seg('HL', '2', '1', '22', '0'));

  // ========================================================================
  // SBR - Subscriber Information
  // Identifies the subscriber's relationship to the payer.
  // SBR01: Payer Responsibility Sequence Number Code (P = Primary)
  // SBR02: Individual Relationship Code (18 = Self)
  // SBR03-08: Not used for Medicaid
  // SBR09: Claim Filing Indicator Code (MC = Medicaid)
  // ========================================================================
  txn.push(seg('SBR', 'P', '18', '', '', '', '', '', '', 'MC'));

  // ========================================================================
  // Loop 2010BA — Subscriber/Patient Name and Demographics
  // NM1*IL: Insured or Subscriber
  // NM1*01: Entity Type (1 = Person)
  // NM1*03: Last Name
  // NM1*04: First Name
  // NM1*08: ID Code Qualifier (MI = Member Identification Number)
  // NM1*09: Medicaid ID
  // ========================================================================
  txn.push(seg('NM1', 'IL', '1', clean(patient.lastName), clean(patient.firstName), '', '', '', 'MI', patient.medicaidId));

  // N3 - Subscriber Address
  if (patient.address2) {
    txn.push(seg('N3', clean(patient.address1), clean(patient.address2)));
  } else {
    txn.push(seg('N3', clean(patient.address1)));
  }

  // N4 - Subscriber City, State, ZIP
  txn.push(seg('N4', clean(patient.city), patient.state, patient.zip.replace(/\D/g, '')));

  // ========================================================================
  // DMG - Subscriber Demographics
  // DMG01: Date Time Period Format Qualifier (D8 = Date CCYYMMDD)
  // DMG02: Date of Birth
  // DMG03: Gender Code (M/F/U)
  // ========================================================================
  txn.push(seg('DMG', 'D8', ediDate(patient.dateOfBirth), patient.gender));

  // ========================================================================
  // Loop 2010BB — Payer Name (Texas Medicaid / TMHP)
  // NM1*PR: Payer
  // NM1*02: Entity Type (2 = Non-Person)
  // NM1*03: Payer Name
  // NM1*08: ID Code Qualifier (PI = Payor Identification)
  // NM1*09: Payer Identifier (TMHP = 330897513)
  // ========================================================================
  txn.push(seg('NM1', 'PR', '2', 'TEXAS MEDICAID', '', '', '', '', 'PI', '330897513'));

  // ========================================================================
  // Loop 2300 — Claim Information
  // CLM - Claim
  // CLM01: Patient Account Number (claim ID, max 20 chars)
  // CLM02: Total Claim Charge Amount
  // CLM03-04: Not used
  // CLM05: Health Care Service Location (composite):
  //         Place of Service Code : Facility Code Qualifier (B) : Frequency Code
  // CLM06: Provider or Supplier Signature Indicator (Y = Yes)
  // CLM07: Assignment or Plan Participation Code (A = Assigned)
  // CLM08: Benefits Assignment Certification Indicator (Y = Yes)
  // CLM09: Release of Information Code (I = Informed Consent)
  // ========================================================================
  const freqCode = claim.frequencyCode || '1';
  txn.push(seg(
    'CLM',
    clean(claim.claimId).slice(0, 20),
    dollars(claim.totalCharge),
    '',
    '',
    `${claim.placeOfService}${COMPONENT_SEP}B${COMPONENT_SEP}${freqCode}`,
    'Y',
    'A',
    'Y',
    'I'
  ));

  // ========================================================================
  // REF*G1 — Prior Authorization Number (conditional)
  // Only included if a prior authorization number is provided.
  // REF01: Reference Identification Qualifier (G1 = Prior Authorization Number)
  // REF02: Authorization Number
  // ========================================================================
  if (claim.priorAuthNumber) {
    txn.push(seg('REF', 'G1', claim.priorAuthNumber));
  }

  // ========================================================================
  // DTP - Date of Service (claim-level)
  // DTP01: Date/Time Qualifier (472 = Service)
  // DTP02: Date Time Period Format Qualifier (D8 = Date CCYYMMDD)
  // DTP03: Date of Service
  // ========================================================================
  txn.push(seg('DTP', '472', 'D8', ediDate(claim.dateOfService)));

  // ========================================================================
  // HI - Health Care Diagnosis Codes (ICD-10)
  // Each element is a composite: Qualifier:DiagnosisCode
  // First code uses ABK (Principal Diagnosis), subsequent use ABF (Other Diagnosis).
  // Periods are stripped from ICD-10 codes per EDI requirements.
  // ========================================================================
  const hiElements = claim.diagnosisCodes.map((code, idx) => {
    const qualifier = idx === 0 ? 'ABK' : 'ABF';
    return `${qualifier}${COMPONENT_SEP}${code.replace(/\./g, '')}`;
  });
  txn.push(seg('HI', ...hiElements));

  // ========================================================================
  // Loop 2310B — Rendering Provider
  // NM1*82: Rendering Provider (individual performing the service)
  // NM1*01: Entity Type (1 = Person)
  // NM1*03: Last Name
  // NM1*04: First Name
  // NM1*08: ID Code Qualifier (XX = NPI)
  // NM1*09: NPI
  // ========================================================================
  txn.push(seg(
    'NM1', '82', '1',
    clean(renderingProvider.lastName),
    clean(renderingProvider.firstName),
    '', '', '',
    'XX',
    fmtNpi(renderingProvider.npi)
  ));

  // ========================================================================
  // PRV - Rendering Provider Specialty
  // PRV01: Provider Code (PE = Performing)
  // PRV02: Reference Identification Qualifier (PXC = Taxonomy)
  // PRV03: Taxonomy Code
  // ========================================================================
  txn.push(seg('PRV', 'PE', 'PXC', renderingProvider.taxonomyCode));

  // ========================================================================
  // Loop 2400 — Service Lines
  // Each service line includes:
  //   LX  - Assigned Number (line counter)
  //   SV1 - Professional Service (CPT, modifiers, charge, units, pointers)
  //   DTP - Date of Service for the line
  // ========================================================================
  serviceLines.forEach((line, idx) => {
    // LX - Line counter (1-based)
    txn.push(seg('LX', String(idx + 1)));

    // SV1 - Professional Service
    // SV101: Composite Medical Procedure (HC:CPT:Mod1:Mod2:Mod3:Mod4)
    // SV102: Line Item Charge Amount
    // SV103: Unit or Basis for Measurement Code (UN = Unit)
    // SV104: Service Unit Count
    // SV105: Place of Service (blank — uses CLM-level POS)
    // SV106: Not used
    // SV107: Composite Diagnosis Code Pointer (1:2:3:4)
    const mods = (line.modifiers || []).filter(Boolean);
    const procedureCode = ['HC', line.cptCode, ...mods].join(COMPONENT_SEP);
    const pointers = (line.icdPointers || [1]).map(String).join(COMPONENT_SEP);

    txn.push(seg('SV1', procedureCode, dollars(line.chargeAmount), 'UN', String(line.units), '', '', pointers));

    // DTP*472 - Service Date for this line
    txn.push(seg('DTP', '472', 'D8', ediDate(line.dateOfService)));
  });

  // ========================================================================
  // SE - Transaction Set Trailer
  // SE01: Number of Included Segments (ST through SE inclusive)
  // SE02: Transaction Set Control Number (must match ST02)
  // ========================================================================
  const segmentCount = txn.length + 1; // +1 for SE itself
  txn.push(seg('SE', String(segmentCount), stCtrl));

  // ========================================================================
  // Build the complete interchange envelope
  // ========================================================================
  const all: string[] = [];

  // ========================================================================
  // ISA - Interchange Control Header
  // Fixed-width fields per the X12 specification.
  // ISA01: Authorization Information Qualifier (00 = No Authorization)
  // ISA02: Authorization Information (10 spaces)
  // ISA03: Security Information Qualifier (00 = No Security)
  // ISA04: Security Information (10 spaces)
  // ISA05: Interchange ID Qualifier (ZZ = Mutually Defined)
  // ISA06: Interchange Sender ID (submitter, 15 chars fixed)
  // ISA07: Interchange ID Qualifier (ZZ = Mutually Defined)
  // ISA08: Interchange Receiver ID (TMHP, 15 chars fixed)
  // ISA09: Interchange Date (YYMMDD)
  // ISA10: Interchange Time (HHMM)
  // ISA11: Repetition Separator (^ for 5010)
  // ISA12: Interchange Control Standards Identifier (00501)
  // ISA13: Interchange Control Number (9 digits)
  // ISA14: Acknowledgment Requested (0 = No)
  // ISA15: Usage Indicator (P = Production, T = Test)
  // ISA16: Component Element Separator (:)
  // ========================================================================
  all.push(seg(
    'ISA',
    '00',
    fixedWidth('', 10),
    '00',
    fixedWidth('', 10),
    'ZZ',
    fixedWidth(submitter.submitterId, 15),
    'ZZ',
    fixedWidth('330897513', 15),
    ediDate(now).slice(2), // YYMMDD
    ediTime(now),
    REPETITION_SEP,
    '00501',
    isaCtrl,
    '0',
    'P', // Production
    COMPONENT_SEP
  ));

  // ========================================================================
  // GS - Functional Group Header
  // GS01: Functional Identifier Code (HC = Health Care)
  // GS02: Application Sender's Code (submitter ID)
  // GS03: Application Receiver's Code (TMHP ID)
  // GS04: Date (CCYYMMDD)
  // GS05: Time (HHMM)
  // GS06: Group Control Number (must match GE02)
  // GS07: Responsible Agency Code (X = Accredited Standards Committee X12)
  // GS08: Version / Release / Industry Identifier Code
  // ========================================================================
  all.push(seg(
    'GS',
    'HC',
    submitter.submitterId,
    '330897513',
    ediDate(now),
    ediTime(now),
    gsCtrl,
    'X',
    '005010X222A1'
  ));

  // Transaction Set (ST through SE)
  all.push(...txn);

  // ========================================================================
  // GE - Functional Group Trailer
  // GE01: Number of Transaction Sets Included (1)
  // GE02: Group Control Number (must match GS06)
  // ========================================================================
  all.push(seg('GE', '1', gsCtrl));

  // ========================================================================
  // IEA - Interchange Control Trailer
  // IEA01: Number of Included Functional Groups (1)
  // IEA02: Interchange Control Number (must match ISA13)
  // ========================================================================
  all.push(seg('IEA', '1', isaCtrl));

  // Build compact version (for transmission — no line breaks between segments)
  const ediContent = all.join('');

  // Build formatted version (for readability — newline after each segment terminator)
  const ediContentFormatted = all.join('\n');

  return {
    success: true,
    ediContent,
    ediContentFormatted,
    errors,
    controlNumbers: { isa: isaCtrl, gs: gsCtrl, st: stCtrl },
    segmentCount,
  };
}
