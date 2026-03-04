/**
 * PTBot Patient Auth Helper
 *
 * Verifies a Supabase Auth session from a patient's mobile app (phone + OTP).
 * Maps the authenticated phone number to a patient record and enforces
 * that the patient can only access their own data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-server';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * Normalize a phone number to digits-only (strip +, spaces, dashes, parens).
 * Keeps the leading country code if present.
 */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * Authenticate a PTBot patient request.
 *
 * 1. Extracts Bearer token from Authorization header
 * 2. Verifies with Supabase Auth (getUser)
 * 3. Looks up patient by the authenticated user's phone number
 * 4. Returns the patient record
 *
 * Returns either { patient, userId } on success or { error, status } on failure.
 */
export type PatientAuthSuccess = { patient: Record<string, unknown>; userId: string; error?: undefined; status?: undefined };
export type PatientAuthError = { patient?: undefined; userId?: undefined; error: string; status: number };
export type PatientAuthResult = PatientAuthSuccess | PatientAuthError;

export function isAuthError(result: PatientAuthResult): result is PatientAuthError {
  return result.error !== undefined;
}

export async function authenticatePatient(
  request: NextRequest
): Promise<PatientAuthResult> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'Missing or invalid Authorization header', status: 401 };
  }

  const token = authHeader.replace('Bearer ', '');

  // Verify the token with Supabase Auth
  // We create a temporary client with the user's token to call getUser
  if (!supabaseUrl) {
    return { error: 'Server configuration error', status: 500 };
  }

  const supabaseWithAuth = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: authError } = await supabaseWithAuth.auth.getUser();

  if (authError || !user) {
    return { error: 'Invalid or expired token', status: 401 };
  }

  // The user should have a phone number (signed in via OTP)
  const userPhone = user.phone;
  if (!userPhone) {
    return { error: 'Authenticated user has no phone number', status: 403 };
  }

  const normalizedPhone = normalizePhone(userPhone);

  // Look up the patient by phone number
  // Try multiple formats: raw, normalized, with/without country code
  const phoneVariants = [
    userPhone,
    normalizedPhone,
    normalizedPhone.startsWith('1') ? normalizedPhone.slice(1) : `1${normalizedPhone}`,
    `+${normalizedPhone}`,
    `+1${normalizedPhone.startsWith('1') ? normalizedPhone.slice(1) : normalizedPhone}`,
  ];

  const { data: patients, error: patientError } = await supabaseAdmin
    .from('patients')
    .select('*')
    .or(phoneVariants.map(p => `phone.eq.${p}`).join(','))
    .is('deleted_at', null)
    .limit(1);

  if (patientError) {
    console.error('Error looking up patient by phone:', patientError);
    return { error: 'Failed to verify patient identity', status: 500 };
  }

  if (!patients || patients.length === 0) {
    return { error: 'No patient record found for this phone number', status: 404 };
  }

  return { patient: patients[0], userId: user.id };
}

/**
 * Verify that the authenticated patient owns the requested resource.
 * Returns an error response if the patient ID doesn't match, or null if OK.
 */
export function verifyPatientAccess(
  authenticatedPatientId: string,
  requestedPatientId: string
): NextResponse | null {
  if (authenticatedPatientId !== requestedPatientId) {
    return NextResponse.json(
      { error: 'Access denied: you can only access your own data' },
      { status: 403 }
    );
  }
  return null;
}
