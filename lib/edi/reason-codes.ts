/**
 * CARC (Claim Adjustment Reason Code) and RARC (Remittance Advice Remark Code) Lookup
 *
 * Contains the most common codes encountered in physical therapy billing,
 * including Texas Medicaid (TMHP) and commercial payer scenarios.
 *
 * Sources: X12 External Code Lists (www.wpc-edi.com)
 */

// ============================================================================
// CARC - Claim Adjustment Reason Codes
// ============================================================================

/**
 * Most common CARCs in physical therapy billing.
 * Covers contractual obligations, patient responsibility, denials,
 * visit limit issues, prior auth, bundling, and medical necessity.
 */
export const CARC_CODES: Record<string, string> = {
  // Contractual / General
  '1': 'Deductible amount',
  '2': 'Coinsurance amount',
  '3': 'Copayment amount',
  '4': 'The procedure code is inconsistent with the modifier used or a required modifier is missing',
  '5': 'The procedure code/bill type is inconsistent with the place of service',
  '6': 'The procedure/revenue code is inconsistent with the patient\'s age',
  '9': 'The diagnosis is inconsistent with the patient\'s age',
  '10': 'The diagnosis is inconsistent with the patient\'s gender',
  '11': 'The diagnosis is inconsistent with the procedure',
  '13': 'The date of death precedes the date of service',
  '14': 'The date of birth follows the date of service',
  '15': 'The authorization number is missing, invalid, or does not apply to the billed services or provider',
  '16': 'Claim/service lacks information or has submission/billing error(s)',
  '18': 'Exact duplicate claim/service',
  '19': 'This is a work-related injury/illness and thus the liability of the Worker\'s Compensation Carrier',
  '22': 'This care may be covered by another payer per coordination of benefits',
  '23': 'The impact of prior payer(s) adjudication including payments and/or adjustments',
  '24': 'Charges are covered under a capitation agreement/managed care plan',
  '26': 'Expenses incurred prior to coverage',
  '27': 'Expenses incurred after coverage terminated',
  '29': 'The time limit for filing has expired',
  '31': 'Patient cannot be identified as our insured',
  '32': 'Our records indicate that this dependent is not an eligible dependent as defined',
  '33': 'Insured has no dependent coverage',
  '34': 'Insured has no coverage for newborns',
  '35': 'Lifetime benefit maximum has been reached',
  '39': 'Services denied at the time authorization/pre-certification was requested',

  // Common PT adjustments
  '45': 'Charge exceeds fee schedule/maximum allowable or contracted/legislated fee arrangement',
  '49': 'This is a non-covered service because it is a routine/preventive exam or is a diagnostic/screening procedure done in conjunction with a routine/preventive exam',
  '50': 'These are non-covered services because this is not deemed a medical necessity by the payer',
  '51': 'These are non-covered services because this is a pre-existing condition',
  '55': 'Procedure/treatment/drug is deemed experimental/investigational by the payer',
  '56': 'Procedure/treatment has not been deemed medically necessary by the payer',
  '58': 'Treatment was deemed by the payer to have been rendered in an inappropriate or invalid place of service',
  '59': 'Processed based on multiple or concurrent procedure rules',

  // Authorization & referral
  '60': 'Charges for outpatient services are not covered when performed within a period of time prior to or after inpatient services',
  '96': 'Non-covered charge(s). At least one Remark Code must be provided',
  '97': 'The benefit for this service is included in the payment/allowance for another service/procedure that has already been adjudicated',
  '107': 'The related or qualifying claim/service was not identified on this claim',
  '109': 'Claim/service not covered by this payer/contractor. You must send the claim/service to the correct payer/contractor',

  // Visit limits and frequency
  '119': 'Benefit maximum for this time period or occurrence has been reached',
  '120': 'Patient is covered by a managed care plan',
  '121': 'Indemnification adjustment - loss of interest',

  // Bundling
  '130': 'Claim submission fee',
  '131': 'Claim specific negotiated discount',
  '132': 'Prearranged demonstration project adjustment',
  '133': 'The disposition of this claim/service is pending further review',
  '136': 'Failure to follow prior payer\'s coverage rules',

  // PT-specific denials
  '140': 'Patient/Insured health identification number and name do not match',
  '146': 'Diagnosis was invalid for the date(s) of service reported',
  '150': 'Payer deems the information submitted does not support this level of service',
  '151': 'Payment adjusted because the payer deems the information submitted does not support this many/frequency of services',
  '167': 'This (these) diagnosis(es) is (are) not covered',
  '170': 'Payment is denied when performed/billed by this type of provider',
  '171': 'Payment is denied when performed/billed by this type of provider in this type of facility',
  '172': 'Payment is adjusted when performed/billed by a provider of this specialty',

  // Common contractual
  '176': 'Prescription drug is not covered',
  '177': 'Patient has not met the required spend down',
  '178': 'The claim/service has been adjusted because it is covered under the patient\'s prescription drug benefit',
  '179': 'Services are not covered when performed/billed by this type of provider',
  '181': 'Procedure code was invalid on the date of service',
  '182': 'Procedure modifier was invalid on the date of service',
  '183': 'The referring provider is not eligible to refer the service billed',
  '184': 'The prescribing/ordering provider is not eligible to prescribe/order the service billed',
  '185': 'The rendering provider is not eligible to perform the service billed',
  '186': 'Level of care change adjustment',
  '187': 'Consumer Directed/Spending Account payment',
  '189': '\'Not otherwise classified\' or unlisted procedure code (CPT/HCPCS) was billed when there is a specific procedure code for this procedure/service',
  '190': 'Payment is included in the allowance for a Skilled Nursing Facility (SNF) PPS  payment',

  // Texas Medicaid / TMHP common
  '192': 'Non standard adjustment code from paper remittance',
  '193': 'Original payment decision is being maintained',
  '194': 'Anesthesia performed by the operating physician, the ## assistant surgeon or the attending physician',
  '197': 'Precertification/authorization/notification/pre-treatment absent',
  '198': 'Precertification/authorization/notification exceeded',
  '199': 'Revenue code and Procedure code do not match',
  '200': 'Expenses incurred during lapse in coverage',
  '201': 'Workers Compensation case settled. Patient is responsible for amount of this claim/service through WC settlement',
  '202': 'Non-covered personal comfort or convenience services',
  '204': 'This service/equipment/drug is not covered under the patient\'s current benefit plan',
  '208': 'National Drug Code (NDC) is invalid',
  '209': 'Per regulatory requirement, this service must be performed and billed by the same entity',

  // More common in PT settings
  '226': 'Information requested from the Billing/Rendering Provider was not provided or was insufficient/incomplete',
  '227': 'Information requested from the patient/insured/responsible party was not provided or was insufficient/incomplete',
  '233': 'Services/charges related to the treating provider\'s failure to obtain the proper license/certification',
  '234': 'This procedure is not paid separately',
  '235': 'Sales Tax',
  '236': 'This procedure or procedure/modifier combination is not compatible with another procedure or procedure/modifier combination provided on the same day',
  '237': 'Legislated/Regulatory Penalty. At least one Remark Code must be provided',
  '242': 'Services not provided by network/primary care providers',

  // Additional common CARCs
  '253': 'Sequestration - Loss of interest',
  '256': 'Service not payable per managed care contract',
  'A0': 'Patient refund amount',
  'A1': 'Claim/Service denied. At least one Remark Code must be provided',
  'A5': 'Medicare Claim PPS Capital Cost Outlier Amount',
  'A6': 'Prior hospitalization or 30 day transfer requirement not met',
  'A8': 'Medicare Claim PPS Capital Old Capital Hold Harmless Amount',
  'B1': 'Non-covered visits',
  'B4': 'Late filing penalty',
  'B5': 'Coverage/program guidelines were not met',
  'B7': 'This provider was not certified/eligible to be paid for this procedure/service on this date of service',
  'B8': 'Alternative services were available, and should have been utilized',
  'B9': 'Patient is enrolled in a Hospice',
  'B10': 'Allowed amount has been reduced because a component of the basic procedure/test was paid as a separate procedure/test',
  'B11': 'The claim/service has been transferred to the proper payer/processor for processing. Claim/service not covered by this payer/processor',
  'B13': 'Previously paid. Payment for this claim/service may have been provided in a previous payment',
  'B14': 'Only one visit or consultation per physician per day is covered',
  'B15': 'This service/procedure requires that a qualifying service/procedure be received and covered. The qualifying other service/procedure has not been received/adjudicated',
  'B16': '\'New Patient\' qualifications were not met',
  'P1': 'State-mandated Requirement for Property and Casualty, see Claim Payment Remarks Code for specific explanation',
  'P2': 'Not a work related injury/illness and target not established for non-work related injury/illness',
  'P3': 'Workers\' Compensation claim adjudication',
  'P4': 'Workers\' Compensation pricing',
};

// ============================================================================
// RARC - Remittance Advice Remark Codes
// ============================================================================

/**
 * Most common RARCs in physical therapy billing.
 * These provide supplemental explanation when paired with CARC codes.
 */
export const RARC_CODES: Record<string, string> = {
  // Common informational remarks
  'M1': 'X-ray not taken within the past 12 months or near the date of the initial visit',
  'M2': 'Not paid separately when the patient is an inpatient',
  'M15': 'Separately billed services/tests have been bundled as they are considered components of the same procedure',
  'M20': 'Missing/incomplete/invalid HCPCS',
  'M24': 'Missing/incomplete/invalid number of units of service',
  'M27': 'Missing/incomplete/invalid entitlement number or SSN',
  'M36': 'This is the approved amount for this claim/service',
  'M39': 'The patient is not liable for payment for this service as the advance notice of non-coverage you provided the patient did not comply with program requirements',
  'M49': 'Missing/incomplete/invalid value code(s) or amount(s)',
  'M50': 'Missing/incomplete/invalid revenue code(s)',
  'M51': 'Missing/incomplete/invalid procedure code(s)',
  'M61': 'Missing/incomplete/invalid primary diagnosis code',
  'M62': 'Missing/incomplete/invalid treatment authorization code',
  'M69': 'Paid at the regular rate as you did not submit documentation to justify the emergency',
  'M76': 'Missing/incomplete/invalid diagnosis or condition',
  'M77': 'Missing/incomplete/invalid place of service',
  'M79': 'Missing/incomplete/invalid charge',
  'M80': 'Not covered when performed during the same session/date as a previously processed service for the patient',

  // Authorization remarks
  'MA01': 'Alert: If you do not agree with what we approved for these services, you may appeal our decision',
  'MA04': 'Secondary payment cannot be considered without the identity of or payment information from the primary payer',
  'MA07': 'The claim information has also been forwarded to Medicaid for review',
  'MA13': 'Alert: You may be subject to penalties if you bill the patient for amounts not reported with the PR (patient responsibility) group code',
  'MA18': 'Alert: The claim information is also being forwarded to the patient\'s supplemental insurer',
  'MA28': 'Alert: Receipt of this notice by a participating provider or supplier is considered notice of the determination',
  'MA30': 'Missing/incomplete/invalid type of bill',
  'MA83': 'Did not indicate whether we are the primary or secondary payer',
  'MA92': 'Missing plan information for other insurance',
  'MA130': 'Your claim contains incomplete and/or invalid information, and no appeal rights are afforded because the claim is unprocessable',

  // PT-specific RARC codes
  'N1': 'Alert: You may appeal this decision',
  'N2': 'This allowance has been made in accordance with the most appropriate level of care provision of your contract agreement',
  'N4': 'Missing/Incomplete/Invalid prior Insurance Carrier(s) EOB',
  'N5': 'Alert: Under your current contract, this referral/authorization must come from the designated Primary Care Provider',
  'N15': 'Services for a newborn must be billed separately',
  'N16': 'Missing/incomplete/invalid patient identifier',
  'N19': 'Procedure code incidental to primary procedure',
  'N20': 'Service not payable with other service rendered on the same date',
  'N21': 'Alert: Your line item has been separated into multiple lines to expedite handling',
  'N22': 'Alert: This procedure code was added/changed because it more accurately describes the services rendered',
  'N30': 'Patient ineligible for this service',
  'N32': 'Institutional claims must be submitted with a type of bill',
  'N35': 'Missing/incomplete/invalid provider identifier for this claim/service',
  'N56': 'Missing/incomplete/invalid procedure code(s) and/or rate(s)',
  'N95': 'This provider type/provider specialty may not bill this service',

  // Therapy cap / visit limit
  'N362': 'The number of Days or Units of Service exceeds our acceptable maximum',
  'N386': 'This decision was based on a National Coverage Determination (NCD)',
  'N425': 'This decision was based on a Local Coverage Determination (LCD)',
  'N430': 'Procedure code is inconsistent with the units of service',
  'N432': 'Alert: Service is not payable with the modifier billed',
  'N438': 'This procedure can only be billed with the appropriate modifier(s)',
  'N440': 'This service requires a modifier and none was billed',
  'N455': 'This is a reminder that you have choices about the way your Medicare claims are processed',
  'N479': 'Missing/Invalid Referring Provider information',
  'N517': 'Payment has been issued to the provider',
  'N519': 'Invalid combination of HCPCS modifiers',
  'N522': 'Duplicate of a claim processed, or to be processed, as a crossover claim',
  'N527': 'Payment reduced based on outpatient therapy/rehabilitation services annual cap',
  'N528': 'Patient is responsible for the difference between the billed and the allowed amount',
  'N530': 'Payment adjusted because claim/service was not furnished directly to the patient and/or in a face-to-face setting',
  'N538': 'Duplicate of a claim/service processed by another payer',
  'N550': 'Resubmit after you receive your remittance advice',
  'N569': 'Adjustment based on a Recovery Audit',
  'N572': 'Claim adjusted based on an Improper Payment report',
  'N574': 'Our records indicate this service was previously denied or adjusted',
  'N580': 'Corrected claim. This claim supersedes a previously submitted/processed claim',
  'N590': 'This is a Capitated Service. Notify the plan if benefits have been exhausted',
  'N620': 'Alert: this claim was processed based on previously adjudicated/processed claims',
  'N632': 'Based on the current value of the threshold',
  'N657': 'This claim/service was either processed or denied based on the applicable fee schedule',

  // TMHP-specific
  'N700': 'Prior authorization/pre-certification absent',
  'N701': 'Prior authorization/pre-certification exceeded',
  'N702': 'This is an informational remittance advice. No payment is being made',
};

// ============================================================================
// Provider Adjustment Reason Codes (PLB)
// ============================================================================

export const PLB_REASON_CODES: Record<string, string> = {
  '50': 'Late Charge',
  '51': 'Interest Penalty Charge',
  '72': 'Authorized Return',
  '90': 'Early Payment Allowance',
  'AH': 'Origination Fee',
  'AM': 'Applied to Borrower\'s Account',
  'AP': 'Acceleration of Benefits',
  'B2': 'Rebate',
  'B3': 'Recovery Allowance',
  'BD': 'Bad Debt Adjustment',
  'BN': 'Bonus',
  'C5': 'Temporary Allowance',
  'CR': 'Capitation Interest',
  'CS': 'Adjustment',
  'CT': 'Capitation Payment',
  'CV': 'Capital Passthrough',
  'CW': 'Certified Registered Nurse Anesthetist Passthrough',
  'DM': 'Direct Medical Education Passthrough',
  'E3': 'Withholding',
  'FB': 'Forwarding Balance',
  'FC': 'Fund Allocation',
  'GO': 'Graduate Medical Education Passthrough',
  'HM': 'Hemophilia Clotting Factor Supplement',
  'IP': 'Incentive Premium Payment',
  'IR': 'Internal Revenue Service Withholding',
  'IS': 'Interim Settlement',
  'J1': 'Nonreimbursable',
  'L3': 'Penalty',
  'L6': 'Interest Owed',
  'LE': 'Levy',
  'LS': 'Lump Sum',
  'OA': 'Organ Acquisition Passthrough',
  'OB': 'Offset of Non-Federal Audit Findings',
  'PI': 'Periodic Interim Payment',
  'PL': 'Payment Final',
  'RA': 'Retro-Activity Adjustment',
  'RE': 'Return on Equity',
  'SL': 'Student Loan Repayment',
  'TL': 'Third Party Liability',
  'WO': 'Overpayment Recovery',
  'WU': 'Unspecified Recovery',
};

// ============================================================================
// Lookup Functions
// ============================================================================

/**
 * Look up a CARC description by code.
 * Returns the description or a default message for unknown codes.
 */
export function lookupCARC(code: string): string {
  return CARC_CODES[code] ?? `Unknown adjustment reason code: ${code}`;
}

/**
 * Look up a RARC description by code.
 * Returns the description or a default message for unknown codes.
 */
export function lookupRARC(code: string): string {
  return RARC_CODES[code] ?? `Unknown remark code: ${code}`;
}

/**
 * Look up a PLB adjustment reason description by code.
 * Returns the description or a default message for unknown codes.
 */
export function lookupPLBReason(code: string): string {
  return PLB_REASON_CODES[code] ?? `Unknown provider adjustment reason: ${code}`;
}

/**
 * Check if a CARC code indicates a PT-relevant denial scenario.
 */
export function isPTDenialCode(code: string): {
  isDenial: boolean;
  category?: 'VISIT_LIMIT' | 'NO_PRIOR_AUTH' | 'BUNDLED' | 'MEDICAL_NECESSITY' | 'NOT_COVERED' | 'OTHER';
} {
  // Visit limit exceeded
  if (['35', '119', '151'].includes(code)) {
    return { isDenial: true, category: 'VISIT_LIMIT' };
  }

  // No prior authorization
  if (['15', '39', '197', '198'].includes(code)) {
    return { isDenial: true, category: 'NO_PRIOR_AUTH' };
  }

  // Bundled services
  if (['59', '97', '234', '236'].includes(code)) {
    return { isDenial: true, category: 'BUNDLED' };
  }

  // Medical necessity
  if (['50', '56', '150'].includes(code)) {
    return { isDenial: true, category: 'MEDICAL_NECESSITY' };
  }

  // General not covered
  if (['4', '5', '96', '109', '170', '171', '179', '204', 'A1', 'B1', 'B5'].includes(code)) {
    return { isDenial: true, category: 'NOT_COVERED' };
  }

  // Denial codes that result in zero payment
  if (['18', '29', '31', '32', '33'].includes(code)) {
    return { isDenial: true, category: 'OTHER' };
  }

  return { isDenial: false };
}

/**
 * Get a human-readable description combining CARC group code + reason.
 */
export function describeAdjustment(groupCode: string, reasonCode: string): string {
  const groupDescriptions: Record<string, string> = {
    'CO': 'Contractual Obligation',
    'PR': 'Patient Responsibility',
    'OA': 'Other Adjustment',
    'PI': 'Payer Initiated Reduction',
    'CR': 'Correction/Reversal',
  };

  const group = groupDescriptions[groupCode] ?? groupCode;
  const reason = lookupCARC(reasonCode);
  return `${group}: ${reason}`;
}
