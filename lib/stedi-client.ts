/**
 * Stedi Healthcare API Client
 *
 * Integrates with Stedi's clearinghouse APIs for:
 * - Real-time eligibility verification (270/271)
 * - Electronic claims submission (837P)
 *
 * Stedi API docs: https://www.stedi.com/docs
 * Auth: API Key in Authorization header
 */

const STEDI_BASE_URL = 'https://healthcare.us.stedi.com/2024-04-01';

interface StediConfig {
  apiKey: string;
}

// ============================================================================
// Eligibility Check (270/271)
// ============================================================================

export interface StediEligibilityRequest {
  controlNumber?: string;
  tradingPartnerServiceId: string; // Payer ID (e.g., "TXMCD" for Texas Medicaid)
  provider: {
    organizationName: string;
    npi: string;
  };
  subscriber: {
    memberId: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string; // YYYYMMDD
    gender?: 'M' | 'F' | 'U';
  };
  encounter?: {
    serviceTypeCodes: string[]; // e.g., ["30"] for health benefit plan coverage
    dateRange?: {
      startDate: string; // YYYYMMDD
      endDate: string;
    };
  };
}

export interface StediEligibilityResponse {
  controlNumber: string;
  tradingPartnerServiceId: string;
  provider: {
    organizationName: string;
    npi: string;
  };
  subscriber: {
    memberId: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    gender: string;
    address?: {
      line1: string;
      city: string;
      state: string;
      zip: string;
    };
  };
  planStatus?: Array<{
    statusCode: string; // "1" = Active, "6" = Inactive
    status: string; // "Active Coverage" or "Inactive"
    serviceTypeCodes: string[];
    planDetails?: string;
  }>;
  planDateInformation?: {
    planBegin?: string;
    planEnd?: string;
    eligibilityBegin?: string;
  };
  benefitsInformation?: Array<{
    code: string;
    name: string;
    serviceTypeCodes: string[];
    insuranceTypeCode?: string;
    coverageLevelCode?: string;
    benefitAmount?: string;
    benefitPercent?: string;
    timeQualifierCode?: string;
    timeQualifier?: string;
    quantityQualifierCode?: string;
    quantity?: string;
    inPlanNetworkIndicatorCode?: string;
    additionalInformation?: Array<{ description: string }>;
  }>;
  errors?: Array<{
    code: string;
    description: string;
    followupAction?: string;
  }>;
  // Raw response fields
  status?: string;
  planName?: string;
  groupNumber?: string;
}

/**
 * Check patient eligibility in real-time via Stedi.
 */
export async function checkEligibility(
  config: StediConfig,
  request: StediEligibilityRequest
): Promise<StediEligibilityResponse> {
  const response = await fetch(`${STEDI_BASE_URL}/change/medicalnetwork/eligibility/v3`, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new StediError(
      `Eligibility check failed: ${response.status} ${response.statusText}`,
      response.status,
      errorBody
    );
  }

  return response.json();
}

/**
 * Parse a Stedi eligibility response into a simplified status.
 */
export function parseEligibilityStatus(response: StediEligibilityResponse): {
  status: 'eligible' | 'ineligible' | 'error';
  planName?: string;
  coverageDates?: { start?: string; end?: string };
  copay?: string;
  coinsurance?: string;
  deductible?: string;
  summary: string;
  details: string[];
} {
  const details: string[] = [];
  let status: 'eligible' | 'ineligible' | 'error' = 'error';
  let planName: string | undefined;
  let copay: string | undefined;
  let coinsurance: string | undefined;
  let deductible: string | undefined;
  let coverageStart: string | undefined;
  let coverageEnd: string | undefined;

  // Check for errors first
  if (response.errors && response.errors.length > 0) {
    const errorMessages = response.errors.map((e) => e.description).join('; ');
    return {
      status: 'error',
      summary: `Error: ${errorMessages}`,
      details: response.errors.map((e) => `${e.code}: ${e.description}`),
    };
  }

  // Check plan status
  if (response.planStatus && response.planStatus.length > 0) {
    const activeStatus = response.planStatus.find(
      (ps) => ps.statusCode === '1' || ps.status?.toLowerCase().includes('active')
    );
    if (activeStatus) {
      status = 'eligible';
      details.push(`Plan Status: ${activeStatus.status || 'Active Coverage'}`);
    } else {
      status = 'ineligible';
      const inactiveStatus = response.planStatus[0];
      details.push(`Plan Status: ${inactiveStatus.status || 'Inactive'}`);
    }
  }

  // Plan name
  planName = response.planName || undefined;
  if (planName) details.push(`Plan: ${planName}`);

  // Group number
  if (response.groupNumber) details.push(`Group: ${response.groupNumber}`);

  // Coverage dates
  if (response.planDateInformation) {
    coverageStart = response.planDateInformation.eligibilityBegin || response.planDateInformation.planBegin;
    coverageEnd = response.planDateInformation.planEnd;
    if (coverageStart) details.push(`Coverage Start: ${formatEdiDateForDisplay(coverageStart)}`);
    if (coverageEnd) details.push(`Coverage End: ${formatEdiDateForDisplay(coverageEnd)}`);
  }

  // Benefits information
  if (response.benefitsInformation) {
    for (const benefit of response.benefitsInformation) {
      if (benefit.code === 'B' && benefit.benefitAmount) {
        copay = `$${benefit.benefitAmount}`;
        details.push(`Copay: ${copay}`);
      }
      if (benefit.code === 'A' && benefit.benefitPercent) {
        coinsurance = `${benefit.benefitPercent}%`;
        details.push(`Coinsurance: ${coinsurance}`);
      }
      if (benefit.code === 'C' && benefit.benefitAmount) {
        deductible = `$${benefit.benefitAmount}`;
        details.push(`Deductible: ${deductible}`);
      }
    }
  }

  // If we still don't know status, default based on whether we got subscriber data
  if (status === 'error' && response.subscriber?.memberId) {
    status = 'eligible'; // Got a valid response with member data
  }

  const summary = status === 'eligible'
    ? `Active coverage${planName ? ` - ${planName}` : ''}`
    : status === 'ineligible'
    ? 'No active coverage found'
    : 'Unable to verify eligibility';

  return {
    status,
    planName,
    coverageDates: coverageStart || coverageEnd ? { start: coverageStart, end: coverageEnd } : undefined,
    copay,
    coinsurance,
    deductible,
    summary,
    details,
  };
}

// ============================================================================
// Claims Submission (837P)
// ============================================================================

export interface StediClaimRequest {
  controlNumber?: string;
  tradingPartnerServiceId: string;
  submitter: {
    organizationName: string;
    contactInformation: {
      name: string;
      phoneNumber: string;
    };
  };
  receiver: {
    organizationName: string;
  };
  billing: {
    providerType: 'billing';
    npi: string;
    employerId: string;
    organizationName: string;
    address: {
      address1: string;
      city: string;
      state: string;
      postalCode: string;
    };
    taxonomyCode?: string;
  };
  subscriber: {
    memberId: string;
    paymentResponsibilityLevelCode: 'P'; // Primary
    firstName: string;
    lastName: string;
    gender: 'M' | 'F' | 'U';
    dateOfBirth: string; // YYYYMMDD
    address?: {
      address1: string;
      city: string;
      state: string;
      postalCode: string;
    };
    payer: {
      organizationName: string;
      payerId: string;
    };
  };
  claimInformation: {
    claimFilingCode: 'MC'; // Medicaid
    patientControlNumber: string;
    claimChargeAmount: string;
    placeOfServiceCode: string;
    claimFrequencyCode: '1'; // Original
    signatureIndicator: 'Y';
    planParticipationCode: 'A'; // Assigned
    releaseInformationCode: 'Y';
    benefitsAssignmentCertificationIndicator: 'Y';
    healthCareCodeInformation: Array<{
      diagnosisTypeCode: 'ABK' | 'ABF'; // ABK=Principal, ABF=Other
      diagnosisCode: string;
    }>;
    serviceFacilityLocation?: {
      organizationName: string;
      address: {
        address1: string;
        city: string;
        state: string;
        postalCode: string;
      };
      npi: string;
    };
    serviceLines: Array<{
      serviceDate: string; // YYYYMMDD
      professionalService: {
        procedureIdentifier: 'HC';
        procedureCode: string;
        procedureModifiers?: string[];
        lineItemChargeAmount: string;
        measurementUnit: 'UN';
        serviceUnitCount: string;
        compositeDiagnosisCodePointers: {
          diagnosisCodePointers: string[];
        };
      };
    }>;
  };
  rendering?: {
    providerType: 'rendering';
    npi: string;
    firstName: string;
    lastName: string;
    taxonomyCode?: string;
  };
}

export interface StediClaimResponse {
  status: string;
  claimId?: string;
  controlNumber?: string;
  tradingPartnerServiceId?: string;
  claims?: Array<{
    claimStatus: {
      statusCode: string;
      status: string;
      statusInformationEffectiveDate?: string;
    };
    patientControlNumber?: string;
    clearinghouseTraceNumber?: string;
    payerClaimControlNumber?: string;
  }>;
  errors?: Array<{
    code: string;
    description: string;
  }>;
}

/**
 * Submit a professional claim (837P) via Stedi.
 */
export async function submitClaim(
  config: StediConfig,
  request: StediClaimRequest
): Promise<StediClaimResponse> {
  const response = await fetch(`${STEDI_BASE_URL}/change/medicalnetwork/professionalclaims/v3`, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new StediError(
      `Claim submission failed: ${response.status} ${response.statusText}`,
      response.status,
      errorBody
    );
  }

  return response.json();
}

// ============================================================================
// Helpers
// ============================================================================

export class StediError extends Error {
  public statusCode: number;
  public responseBody: string;

  constructor(message: string, statusCode: number, responseBody: string) {
    super(message);
    this.name = 'StediError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

/**
 * Format a date string to YYYYMMDD for Stedi API.
 */
export function toStediDate(dateStr: string): string {
  return dateStr.replace(/-/g, '').slice(0, 8);
}

/**
 * Format an EDI date (YYYYMMDD) for display (MM/DD/YYYY).
 */
function formatEdiDateForDisplay(ediDate: string): string {
  if (!ediDate || ediDate.length < 8) return ediDate;
  return `${ediDate.slice(4, 6)}/${ediDate.slice(6, 8)}/${ediDate.slice(0, 4)}`;
}

/**
 * Check if Stedi API key is configured.
 */
export function isStediConfigured(): boolean {
  return !!process.env.STEDI_API_KEY;
}

/**
 * Get Stedi config from environment or clinic settings.
 */
export function getStediConfig(clinicApiKey?: string | null): StediConfig | null {
  const apiKey = clinicApiKey || process.env.STEDI_API_KEY;
  if (!apiKey) return null;
  return { apiKey };
}
