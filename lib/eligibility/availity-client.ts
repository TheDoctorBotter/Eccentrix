/**
 * Availity Essentials API client — eligibility verification (270/271).
 *
 * Auth flow:  POST /availity/v1/token  (client_credentials)
 * Eligibility: POST /availity/v1/eligibility-inquiries
 *
 * All credentials come from environment variables.
 * Never logs PHI — only status codes and error codes.
 */

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface AvailityEligibilityRequest {
  controlNumber: string;
  tradingPartnerId: string;
  provider: {
    npi: string;
    taxId: string;
    serviceProviderNumber: string;
  };
  subscriber: {
    memberId: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string; // YYYYMMDD
    gender?: string;     // M | F
  };
  serviceTypeCode: string;
}

export interface AvailityNormalizedResult {
  status: 'active' | 'inactive' | 'error' | 'manual_required';
  payerName: string | null;
  planName: string | null;
  memberId: string | null;
  groupNumber: string | null;
  effectiveDate: string | null;
  terminationDate: string | null;
  copay: string | null;
  deductible: string | null;
  message?: string;
  portalUrl?: string;
  rawResponse?: unknown;
}

// ────────────────────────────────────────────────────────────────────────────
// Token management (simple per-process cache)
// ────────────────────────────────────────────────────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(baseUrl: string, clientId: string, clientSecret: string): Promise<string> {
  // Reuse cached token if still valid (with 60 s buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const res = await fetch(`${baseUrl}/availity/v1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const status = res.status;
    throw new AvailityError(`Token request failed (${status})`, status);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

// ────────────────────────────────────────────────────────────────────────────
// Eligibility check
// ────────────────────────────────────────────────────────────────────────────

export async function checkAvailityEligibility(
  req: AvailityEligibilityRequest,
): Promise<AvailityNormalizedResult> {
  const baseUrl = process.env.AVAILITY_API_URL || 'https://api.availity.com';
  const clientId = process.env.AVAILITY_CLIENT_ID!;
  const clientSecret = process.env.AVAILITY_CLIENT_SECRET!;

  const token = await getAccessToken(baseUrl, clientId, clientSecret);

  const res = await fetch(`${baseUrl}/availity/v1/eligibility-inquiries`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const status = res.status;
    if (status === 401) {
      // Invalidate cached token
      cachedToken = null;
      throw new AvailityError('Availity credentials invalid or expired', status);
    }
    if (status === 403) {
      throw new AvailityError('Access denied — check NPI and Tax ID configuration', status);
    }
    throw new AvailityError(`Eligibility request failed (${status})`, status);
  }

  const raw = await res.json();
  return normalizeResponse(raw);
}

// ────────────────────────────────────────────────────────────────────────────
// Response normalisation
// ────────────────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
function normalizeResponse(raw: any): AvailityNormalizedResult {
  try {
    // Availity responses vary by payer — be defensive
    const subscriber = raw?.subscriber ?? {};
    const planStatus = raw?.planStatus?.[0] ?? {};
    const planDates = raw?.planDateInformation ?? {};
    const benefits = raw?.benefitsInformation ?? [];

    const isActive =
      planStatus?.statusCode === '1' ||
      (planStatus?.status ?? '').toLowerCase().includes('active');

    let copay: string | null = null;
    let deductible: string | null = null;

    for (const b of benefits) {
      if (b.code === 'B' && b.benefitAmount) copay = `$${b.benefitAmount}`;
      if (b.code === 'C' && b.benefitAmount) deductible = `$${b.benefitAmount}`;
    }

    return {
      status: isActive ? 'active' : 'inactive',
      payerName: raw?.tradingPartnerServiceId ?? null,
      planName: raw?.planName ?? planStatus?.planDetails ?? null,
      memberId: subscriber?.memberId ?? null,
      groupNumber: raw?.groupNumber ?? null,
      effectiveDate: planDates?.eligibilityBegin ?? planDates?.planBegin ?? null,
      terminationDate: planDates?.planEnd ?? null,
      copay,
      deductible,
      rawResponse: raw,
    };
  } catch {
    return {
      status: 'error',
      payerName: null,
      planName: null,
      memberId: null,
      groupNumber: null,
      effectiveDate: null,
      terminationDate: null,
      copay: null,
      deductible: null,
      message: 'Failed to parse Availity response',
      rawResponse: raw,
    };
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

export class AvailityError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'AvailityError';
    this.statusCode = statusCode;
  }
}

/** Generate a 9-digit control number from timestamp + random */
export function generateControlNumber(): string {
  const ts = Date.now().toString().slice(-5);
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${ts}${rand}`;
}

/** Format YYYY-MM-DD to YYYYMMDD */
export function toAvailityDate(dateStr: string): string {
  return dateStr.replace(/-/g, '').slice(0, 8);
}
