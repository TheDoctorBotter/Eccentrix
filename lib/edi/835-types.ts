/**
 * EDI 835 (Electronic Remittance Advice) Type Definitions
 * ANSI X12 835 v5010A1 compliant data structures
 *
 * Used to represent parsed 835 remittance data from commercial payers and Texas Medicaid (TMHP).
 * All monetary amounts are in DOLLARS (decimals), matching the raw 835 format.
 */

// ============================================================================
// Envelope Types (ISA/GS)
// ============================================================================

export interface ISAEnvelope {
  authorizationQualifier: string;       // ISA01
  authorizationInfo: string;            // ISA02
  securityQualifier: string;            // ISA03
  securityInfo: string;                 // ISA04
  senderQualifier: string;             // ISA05
  senderId: string;                     // ISA06
  receiverQualifier: string;           // ISA07
  receiverId: string;                   // ISA08
  date: string;                         // ISA09 (YYMMDD)
  time: string;                         // ISA10 (HHMM)
  repetitionSeparator: string;          // ISA11
  versionNumber: string;                // ISA12
  controlNumber: string;                // ISA13
  acknowledgmentRequested: string;      // ISA14
  usageIndicator: 'P' | 'T';           // ISA15 (Production/Test)
  componentSeparator: string;           // ISA16
}

export interface GSEnvelope {
  functionalIdentifierCode: string;     // GS01 (HP = Health Care Claim Payment/Advice)
  senderCode: string;                   // GS02
  receiverCode: string;                 // GS03
  date: string;                         // GS04 (YYYYMMDD)
  time: string;                         // GS05
  controlNumber: string;                // GS06
  responsibleAgency: string;            // GS07
  versionCode: string;                  // GS08
}

export interface Envelope {
  isa: ISAEnvelope;
  gs: GSEnvelope;
}

// ============================================================================
// Address & Contact Types
// ============================================================================

export interface EDI835Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
}

export interface ContactInfo {
  name?: string;
  phone?: string;
  phoneExtension?: string;
  fax?: string;
  email?: string;
  url?: string;
}

// ============================================================================
// Loop 1000A - Payer Identification
// ============================================================================

export interface PayerIdentification {
  name: string;                         // N1*PR payer name
  identifierCode: string;              // N1*PR ID code (payer ID)
  address?: EDI835Address;              // N3/N4 segments
  technicalContact?: ContactInfo;       // PER*BL or PER*CX
  webContact?: ContactInfo;             // PER*IC
  additionalId?: string;               // REF segment reference ID
}

// ============================================================================
// Loop 1000B - Payee Identification
// ============================================================================

export interface PayeeIdentification {
  name: string;                         // N1*PE payee name
  identifierQualifier: string;         // N1 ID qualifier (FI=Tax ID, XX=NPI)
  identifierCode: string;              // N1 ID code
  npi?: string;                        // NPI if available
  taxId?: string;                      // Tax ID (EIN) if available
  address?: EDI835Address;              // N3/N4 segments
  additionalIds: PayeeAdditionalId[];  // REF segments
}

export interface PayeeAdditionalId {
  qualifier: string;                    // REF qualifier (TJ=Tax ID, PQ=Payee ID, etc.)
  value: string;                        // REF value
}

// ============================================================================
// Loop 2000 - Transaction Info (Header Number / Claim Payment Info)
// ============================================================================

export type PaymentMethodCode = 'CHK' | 'ACH' | 'FWT' | 'BOP' | 'NON';

export interface TransactionInfo {
  paymentMethod: PaymentMethodCode;     // BPR01 (CHK=Check, ACH=EFT, etc.)
  totalPaymentAmount: number;           // BPR02 total actual payment amount (dollars)
  creditDebitFlag: string;              // BPR03 (C=Credit, D=Debit)
  senderBankAccountNumber?: string;     // BPR10
  senderBankId?: string;               // BPR12
  receiverBankAccountNumber?: string;   // BPR15
  receiverBankId?: string;             // BPR13
  checkOrEftNumber: string;            // TRN02 check/EFT trace number
  traceOriginatorId?: string;          // TRN03 originator company ID
  traceOriginatorSupplementalId?: string; // TRN04
  paymentDate: string;                  // DTM*405 production date (YYYYMMDD)
  payerIdentification: PayerIdentification;   // Loop 1000A
  payeeIdentification: PayeeIdentification;   // Loop 1000B
  claims: ClaimPayment[];               // Loop 2100 claims
  providerAdjustments: ProviderAdjustment[];  // PLB segments
}

// ============================================================================
// PLB - Provider Level Balance (Adjustments)
// ============================================================================

export interface ProviderAdjustment {
  providerIdentifier: string;           // PLB01 provider tax ID
  fiscalPeriodDate: string;            // PLB02 (YYYYMMDD)
  adjustments: ProviderAdjustmentDetail[];
}

export interface ProviderAdjustmentDetail {
  reasonCode: string;                   // PLB03-1 or PLB05-1 adjustment reason code
  referenceId?: string;                // PLB03-2 or PLB05-2 reference identifier
  amount: number;                       // PLB04 or PLB06 monetary amount (dollars)
}

// ============================================================================
// Loop 2100 - Claim Payment Information
// ============================================================================

export type ClaimStatusCode = '1' | '2' | '3' | '4' | '19' | '20' | '21' | '22' | '23' | '25';

export const CLAIM_STATUS_DESCRIPTIONS: Record<string, string> = {
  '1': 'Processed as Primary',
  '2': 'Processed as Secondary',
  '3': 'Processed as Tertiary',
  '4': 'Denied',
  '19': 'Processed as Primary, Forwarded to Additional Payer(s)',
  '20': 'Processed as Secondary, Forwarded to Additional Payer(s)',
  '21': 'Processed as Tertiary, Forwarded to Additional Payer(s)',
  '22': 'Reversal of Previous Payment',
  '23': 'Not Our Claim, Forwarded to Additional Payer(s)',
  '25': 'Reject into/out of adjudication system',
};

export interface ClaimPayment {
  // CLP segment fields
  patientAccountNumber: string;         // CLP01 patient control number / claim ID
  claimStatus: ClaimStatusCode | string; // CLP02 claim status code
  totalChargedAmount: number;           // CLP03 total claim charge amount (dollars)
  totalPaidAmount: number;              // CLP04 claim payment amount (dollars)
  patientResponsibilityAmount?: number; // CLP05 patient responsibility amount
  claimFilingIndicator?: string;        // CLP06 claim filing indicator code
  payerClaimControlNumber?: string;     // CLP07 payer claim control number
  facilityCode?: string;               // CLP08 facility type code
  frequencyCode?: string;               // CLP09 claim frequency code

  // Patient/Subscriber info (NM1 segments)
  patientName: PatientName;             // NM1*QC
  insuredName?: PatientName;            // NM1*IL
  correctedPatientName?: PatientName;   // NM1*74
  otherSubscriberName?: PatientName;    // NM1*82

  // MIA/MOA segments
  inpatientAdjudication?: InpatientAdjudication;  // MIA
  outpatientAdjudication?: OutpatientAdjudication; // MOA

  // Dates
  statementFromDate?: string;           // DTM*232 (YYYYMMDD)
  statementToDate?: string;             // DTM*233 (YYYYMMDD)
  coverageExpirationDate?: string;      // DTM*036

  // Claim-level adjustments (CAS segments)
  adjustments: ClaimAdjustment[];

  // Reference numbers
  originalReferenceNumber?: string;     // REF*F8 original claim reference
  payerClaimId?: string;               // REF*1K payer claim ID
  institutionalBillType?: string;       // REF*BLT
  medicalRecordNumber?: string;         // REF*EA
  otherReferenceNumbers: ReferenceNumber[];

  // Supplemental amounts
  supplementalAmounts: SupplementalAmount[];

  // Service lines (Loop 2110)
  serviceLines: ServiceLinePayment[];

  // Rendering provider
  renderingProviderNpi?: string;        // NM1*82 rendering provider
  crossoverCarrier?: string;            // NM1*TT
}

// ============================================================================
// Patient Name
// ============================================================================

export interface PatientName {
  entityType: '1' | '2';               // 1=Person, 2=Organization
  lastName: string;                      // NM103
  firstName?: string;                    // NM104
  middleName?: string;                   // NM105
  suffix?: string;                       // NM107
  identifierQualifier?: string;         // NM108 (MI=Member ID, etc.)
  identifier?: string;                   // NM109 (member ID value)
}

// ============================================================================
// Adjustment Types
// ============================================================================

export type AdjustmentGroupCode = 'CO' | 'PR' | 'OA' | 'PI' | 'CR';

export const ADJUSTMENT_GROUP_DESCRIPTIONS: Record<string, string> = {
  'CO': 'Contractual Obligation',
  'PR': 'Patient Responsibility',
  'OA': 'Other Adjustment',
  'PI': 'Payer Initiated Reduction',
  'CR': 'Corrections and Reversals',
};

export interface AdjustmentDetail {
  reasonCode: string;                   // CAS02/05/08/11/14/17 (CARC)
  amount: number;                       // CAS03/06/09/12/15/18 monetary amount (dollars)
  quantity?: number;                    // CAS04/07/10/13/16/19 quantity
}

export interface ClaimAdjustment {
  groupCode: AdjustmentGroupCode | string; // CAS01 (CO, PR, OA, PI, CR)
  details: AdjustmentDetail[];
}

// ============================================================================
// Reference Numbers
// ============================================================================

export interface ReferenceNumber {
  qualifier: string;                    // REF01
  value: string;                        // REF02
  description?: string;                 // REF03
}

// ============================================================================
// Supplemental Amounts
// ============================================================================

export interface SupplementalAmount {
  qualifier: string;                    // AMT01 (AU=Allowed, T=Tax, F5=Patient Paid, etc.)
  amount: number;                       // AMT02 amount (dollars)
}

// ============================================================================
// Adjudication Types (MIA/MOA)
// ============================================================================

export interface InpatientAdjudication {
  coveredDays?: number;                 // MIA01
  ppsOperatingOutlierAmount?: number;  // MIA02
  lifetimePsychiatricDays?: number;    // MIA03
  claimDrgAmount?: number;              // MIA04
  remarkCodes: string[];                // MIA24 remark codes
}

export interface OutpatientAdjudication {
  reimbursementRate?: number;           // MOA01
  claimHcpcsPayableAmount?: number;    // MOA02
  remarkCodes: string[];                // MOA03-07 remark codes
  esrdPaymentAmount?: number;           // MOA08
  nonPayableProfessionalAmount?: number; // MOA09
}

// ============================================================================
// Loop 2110 - Service Line Payment Information
// ============================================================================

export interface ServiceLinePayment {
  // SVC segment
  procedure: ProcedureCode;
  chargedAmount: number;                // SVC02 line item charge amount (dollars)
  paidAmount: number;                   // SVC03 line item provider payment amount (dollars)
  revenueCode?: string;                // SVC04 revenue code
  unitsPaid?: number;                   // SVC05 units of service paid count
  originalProcedure?: ProcedureCode;    // SVC06 original procedure (for corrections)
  unitsBilled?: number;                // SVC07 original units of service count

  // Dates
  serviceDate?: string;                 // DTM*472 service date (YYYYMMDD)
  serviceDateEnd?: string;              // DTM*472 service date end (for ranges)

  // Line-level adjustments (CAS segments)
  adjustments: ClaimAdjustment[];

  // Reference numbers
  referenceNumbers: ReferenceNumber[];

  // Supplemental amounts
  supplementalAmounts: SupplementalAmount[];

  // Remark codes (LQ segments)
  remarkCodes: RemarkCode[];

  // Allowed amount (from AMT*B6)
  allowedAmount?: number;
}

export interface ProcedureCode {
  qualifier: string;                    // HC=CPT, AD=ADA, etc.
  code: string;                         // CPT/HCPCS code
  modifiers: string[];                  // Up to 4 modifiers
}

export interface RemarkCode {
  qualifier: string;                    // HE=RARC, RX=NCPDP Reject/Payment
  code: string;                         // Remark code value
}

// ============================================================================
// Full Parsed 835 Result
// ============================================================================

export interface Parsed835 {
  envelope: Envelope;
  transactions: TransactionInfo[];
  validationErrors: ValidationError835[];
  rawSegmentCount: number;
}

export interface ValidationError835 {
  segment?: string;
  position?: number;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

// ============================================================================
// Payment Summary Types (for payment-summary.ts)
// ============================================================================

export interface PaymentSummary {
  checkOrEftNumber: string;
  paymentMethod: string;
  paymentDate: string;
  payerName: string;
  payerId: string;
  payeeName: string;
  payeeNpi?: string;
  totalPaymentAmount: number;
  totalChargedAmount: number;
  totalAllowedAmount: number;
  totalPatientResponsibility: number;
  totalContractualAdjustment: number;
  totalOtherAdjustments: number;
  providerAdjustmentTotal: number;
  claimCount: number;
  paidClaimCount: number;
  deniedClaimCount: number;
  reversalCount: number;
  claims: ClaimSummary[];
  providerAdjustments: ProviderAdjustmentSummary[];
  flags: SummaryFlag[];
}

export interface ClaimSummary {
  patientAccountNumber: string;
  patientName: string;
  claimStatus: string;
  claimStatusDescription: string;
  chargedAmount: number;
  allowedAmount: number;
  paidAmount: number;
  patientResponsibility: number;
  contractualAdjustment: number;
  otherAdjustments: number;
  payerClaimControlNumber?: string;
  statementDateRange?: string;
  serviceLines: ServiceLineSummary[];
  denialReasons: DenialReasonSummary[];
  flags: SummaryFlag[];
}

export interface ServiceLineSummary {
  cptCode: string;
  modifiers: string[];
  description?: string;
  serviceDate?: string;
  chargedAmount: number;
  allowedAmount: number;
  paidAmount: number;
  unitsBilled?: number;
  unitsPaid?: number;
  patientResponsibility: number;
  contractualAdjustment: number;
  otherAdjustments: number;
  adjustmentDetails: AdjustmentSummaryDetail[];
  isDenied: boolean;
  denialReasons: DenialReasonSummary[];
}

export interface AdjustmentSummaryDetail {
  groupCode: string;
  groupDescription: string;
  reasonCode: string;
  reasonDescription: string;
  amount: number;
}

export interface DenialReasonSummary {
  reasonCode: string;
  description: string;
  remarkCodes: string[];
  remarkDescriptions: string[];
}

export interface ProviderAdjustmentSummary {
  reasonCode: string;
  reasonDescription: string;
  amount: number;
  referenceId?: string;
}

export type SummaryFlagType =
  | 'UNDERPAYMENT'
  | 'DENIAL'
  | 'PARTIAL_DENIAL'
  | 'REVERSAL'
  | 'UNUSUAL_ADJUSTMENT'
  | 'VISIT_LIMIT_EXCEEDED'
  | 'NO_PRIOR_AUTH'
  | 'BUNDLED_SERVICE'
  | 'MEDICAL_NECESSITY'
  | 'RECOUPMENT'
  | 'ZERO_PAYMENT'
  | 'UNITS_REDUCED';

export interface SummaryFlag {
  type: SummaryFlagType;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  claimId?: string;
  lineIndex?: number;
}
