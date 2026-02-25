/**
 * Buckeye EMR — EDI 837P & 835 TypeScript Interfaces
 * ANSI X12 5010 005010X222A1 (Professional Claims)
 *
 * All data structures used for:
 *   - 837P claim generation → TMHP submission
 *   - 835 remittance advice parsing
 *   - SFTP upload to TMHP EDI Gateway
 */

// ============================================================================
// Submitter Information
// ============================================================================

/** ISA/GS-level submitter identification for the EDI interchange envelope. */
export interface SubmitterInfo {
  /** Submitter name used in NM1*41 (Loop 1000A). */
  name: string;
  /** Submitter ID used in ISA06 and GS02. Typically a Medicaid provider ID or ETIN. */
  submitterId: string;
  /** Contact person name used in PER segment. */
  contactName: string;
  /** Contact phone number used in PER*TE (10 digits). */
  contactPhone: string;
  /** Optional contact email used in PER*EM. */
  contactEmail?: string;
}

// ============================================================================
// Billing Provider
// ============================================================================

/** Billing provider (practice/clinic) information for Loop 2010AA. */
export interface BillingProvider {
  /** Practice/organization name (NM1*85). */
  name: string;
  /** National Provider Identifier — 10 digits (NM1*85 qualifier XX). */
  npi: string;
  /** Provider taxonomy code, e.g. "225100000X" for Physical Therapy (PRV*BI). */
  taxonomyCode: string;
  /** Street address line 1 (N3 segment). */
  address1: string;
  /** Street address line 2 (N3 segment, optional). */
  address2?: string;
  /** City (N4 segment). */
  city: string;
  /** Two-letter state code (N4 segment). */
  state: string;
  /** ZIP code — 5 or 9 digits (N4 segment). */
  zip: string;
  /** Employer Identification Number — 9 digits (REF*EI segment). */
  taxId: string;
}

// ============================================================================
// Rendering Provider
// ============================================================================

/** Rendering provider (individual therapist) information for Loop 2310B. */
export interface RenderingProvider {
  /** Therapist first name (NM1*82). */
  firstName: string;
  /** Therapist last name (NM1*82). */
  lastName: string;
  /** National Provider Identifier — 10 digits (NM1*82 qualifier XX). */
  npi: string;
  /** Provider taxonomy code (PRV*PE). */
  taxonomyCode: string;
}

// ============================================================================
// Patient / Subscriber
// ============================================================================

/** Patient/subscriber demographics for Loops 2010BA/2010CA. */
export interface PatientSubscriber {
  /** Patient first name (NM1*IL or NM1*QC). */
  firstName: string;
  /** Patient last name (NM1*IL or NM1*QC). */
  lastName: string;
  /** Date of birth in YYYY-MM-DD format (DMG segment). */
  dateOfBirth: string;
  /** Gender code: M, F, or U (DMG segment). */
  gender: 'M' | 'F' | 'U';
  /** Medicaid ID / Member ID (NM1*IL qualifier MI). */
  medicaidId: string;
  /** Street address line 1 (N3 segment). */
  address1: string;
  /** Street address line 2 (optional). */
  address2?: string;
  /** City (N4 segment). */
  city: string;
  /** Two-letter state code (N4 segment). */
  state: string;
  /** ZIP code — 5 or 9 digits (N4 segment). */
  zip: string;
}

// ============================================================================
// Claim Details
// ============================================================================

/** Claim-level information for Loop 2300. */
export interface ClaimDetails {
  /** Patient account number / claim ID (CLM01, BHT03). Max 20 chars. */
  claimId: string;
  /** Total charge amount in dollars (CLM02). */
  totalCharge: number;
  /** Place of service code, e.g. "11" = Office (CLM05 composite). */
  placeOfService: string;
  /** Date of service in YYYY-MM-DD format (DTP*472 at claim level). */
  dateOfService: string;
  /** ICD-10 diagnosis codes, up to 12 (HI segment). First is principal (ABK), rest are secondary (ABF). */
  diagnosisCodes: string[];
  /** Frequency type code: "1"=Original, "7"=Replacement, "8"=Void. Defaults to "1". */
  frequencyCode?: string;
  /** Prior authorization number, if applicable (REF*G1). */
  priorAuthNumber?: string;
}

// ============================================================================
// Service Line
// ============================================================================

/** Individual service line for Loop 2400 (SV1 + DTP segments). */
export interface ServiceLine {
  /** CPT/HCPCS procedure code (SV1 composite element, qualifier HC). */
  cptCode: string;
  /** Procedure modifiers, e.g. ["GP", "59"]. Max 4 (SV1 composite). */
  modifiers: string[];
  /** Number of service units (SV1*04). */
  units: number;
  /** Line item charge amount in dollars (SV1*02). */
  chargeAmount: number;
  /** Date of service in YYYY-MM-DD format (DTP*472). */
  dateOfService: string;
  /** 1-based pointers into ClaimDetails.diagnosisCodes (SV1*07 composite). */
  icdPointers: number[];
}

// ============================================================================
// Complete Claim Input
// ============================================================================

/** Complete structured input for generating an ANSI X12 837P file. */
export interface Claim837PInput {
  submitter: SubmitterInfo;
  billingProvider: BillingProvider;
  renderingProvider: RenderingProvider;
  patient: PatientSubscriber;
  claim: ClaimDetails;
  serviceLines: ServiceLine[];
}

// ============================================================================
// Validation
// ============================================================================

/** A single validation error or warning produced before 837P generation. */
export interface ValidationError {
  /** The field path that failed validation. */
  field: string;
  /** Human-readable description of the issue. */
  message: string;
  /** "error" prevents generation; "warning" is informational. */
  severity: 'error' | 'warning';
}

// ============================================================================
// Generation Result
// ============================================================================

/** Result returned by generate837P(). */
export interface GenerationResult {
  /** Whether generation succeeded. */
  success: boolean;
  /** The complete 837P EDI file content (segment-terminated). */
  ediContent?: string;
  /** Human-readable version with line breaks. */
  ediContentFormatted?: string;
  /** Validation errors/warnings. */
  errors: ValidationError[];
  /** Control numbers used in the interchange. */
  controlNumbers: {
    /** ISA13 — 9-digit interchange control number. */
    isa: string;
    /** GS06 — group control number. */
    gs: string;
    /** ST02 — transaction set control number. */
    st: string;
  };
  /** Number of segments in the transaction set (ST through SE inclusive). */
  segmentCount: number;
}

// ============================================================================
// SFTP Configuration
// ============================================================================

/** Configuration for connecting to the TMHP EDI Gateway via SFTP. */
export interface TMHPSftpConfig {
  /** SFTP hostname (e.g. "edi.tmhp.com"). */
  host: string;
  /** SFTP port (default 22). */
  port?: number;
  /** SFTP username (assigned by TMHP). */
  username: string;
  /** SFTP password. */
  password?: string;
  /** Path to SSH private key file (alternative to password). */
  privateKeyPath?: string;
  /** Remote directory to upload 837P files to. */
  remoteDir?: string;
  /** Remote directory to download 835 response files from. */
  responseDir?: string;
}

/** Result of an SFTP upload operation. */
export interface SftpUploadResult {
  success: boolean;
  /** Remote file path where the 837P was uploaded. */
  remoteFilePath?: string;
  /** File size in bytes. */
  fileSize?: number;
  /** Timestamp of upload. */
  uploadedAt?: string;
  /** Error message if upload failed. */
  error?: string;
}

// ============================================================================
// 835 (Electronic Remittance Advice) Types
// ============================================================================

/** A single parsed claim payment from an 835 remittance. */
export interface RemittanceClaim {
  /** Patient control number / claim ID (CLP01). */
  patientAccountNumber: string;
  /**
   * Claim status code (CLP02):
   *   1 = Processed as Primary
   *   2 = Processed as Secondary
   *   4 = Denied
   *   22 = Reversal
   */
  claimStatus: string;
  /** Total charged amount in dollars (CLP03). */
  totalCharged: number;
  /** Amount paid by payer in dollars (CLP04). */
  totalPaid: number;
  /** Patient responsibility amount in dollars (CLP05). */
  patientResponsibility: number;
  /** Payer claim control number (CLP07). */
  payerClaimControlNumber?: string;
  /** Service line payment details (SVC loops). */
  serviceLines: RemittanceServiceLine[];
  /** Claim-level adjustments (CAS segments). */
  adjustments: RemittanceAdjustment[];
}

/** A single service line payment from an 835 (Loop 2110 / SVC segment). */
export interface RemittanceServiceLine {
  /** CPT/HCPCS procedure code. */
  procedureCode: string;
  /** Procedure modifiers. */
  modifiers: string[];
  /** Charged amount in dollars (SVC02). */
  chargedAmount: number;
  /** Paid amount in dollars (SVC03). */
  paidAmount: number;
  /** Units paid (SVC05). */
  unitsPaid?: number;
  /** Service date (DTM*472). */
  serviceDate?: string;
  /** Line-level adjustments (CAS segments). */
  adjustments: RemittanceAdjustment[];
}

/** A single adjustment from a CAS segment. */
export interface RemittanceAdjustment {
  /**
   * Adjustment group code (CAS01):
   *   CO = Contractual Obligation
   *   PR = Patient Responsibility
   *   OA = Other Adjustment
   *   PI = Payer Initiated Reduction
   *   CR = Corrections and Reversals
   */
  groupCode: string;
  /** Individual adjustment reason/amount pairs. */
  reasons: RemittanceAdjustmentReason[];
}

/** A single reason code + amount within a CAS segment. */
export interface RemittanceAdjustmentReason {
  /** CARC reason code (CAS02/05/08/...). */
  reasonCode: string;
  /** Adjustment amount in dollars (CAS03/06/09/...). */
  amount: number;
  /** Quantity (CAS04/07/10/..., optional). */
  quantity?: number;
}

/** Complete parsed 835 remittance result. */
export interface Parsed835Result {
  /** Whether parsing succeeded. */
  success: boolean;
  /** Check or EFT trace number (TRN02). */
  checkNumber?: string;
  /** Total payment amount (BPR02). */
  totalPayment?: number;
  /** Payment date (DTM*405). */
  paymentDate?: string;
  /** Payer name (N1*PR). */
  payerName?: string;
  /** Payer ID (N1*PR identifier). */
  payerId?: string;
  /** Payee/provider name (N1*PE). */
  payeeName?: string;
  /** Parsed claims with payment details. */
  claims: RemittanceClaim[];
  /** Parsing errors or warnings. */
  errors: string[];
}

// ============================================================================
// API Route Types
// ============================================================================

/** Request body for the claims submission API route. */
export interface ClaimSubmitRequest {
  /** UUID of the claim to submit. */
  claimId: string;
  /** Whether to upload to TMHP via SFTP after generating. Defaults to false. */
  submitViaSftp?: boolean;
}

/** Response from the claims submission API route. */
export interface ClaimSubmitResponse {
  success: boolean;
  /** Generated 837P content. */
  ediContent?: string;
  /** Human-readable formatted 837P. */
  ediContentFormatted?: string;
  /** SFTP upload result, if submission was requested. */
  sftpResult?: SftpUploadResult;
  /** Claim status after processing. */
  claimStatus?: string;
  /** Error message if failed. */
  error?: string;
}
