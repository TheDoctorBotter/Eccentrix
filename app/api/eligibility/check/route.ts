/**
 * Eligibility Check API
 * POST: Check patient eligibility via Availity API (real-time) or return manual fallback.
 *
 * When AVAILITY_ENABLED=true and credentials are configured, performs a real-time
 * 270/271 eligibility check via Availity Essentials API.
 *
 * When AVAILITY_ENABLED is not 'true', returns a manual_required response so the
 * UI can show a clean fallback card (no 403 errors).
 *
 * Every check (including manual_required) is logged to the eligibility_checks table.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';
import {
  checkAvailityEligibility,
  generateControlNumber,
  toAvailityDate,
  AvailityError,
} from '@/lib/eligibility/availity-client';
import { resolvePayerId } from '@/lib/eligibility/payerMap';

export async function POST(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const body = await request.json();
    const {
      clinic_id,
      patient_id,
      medicaid_id,
      service_type,
      date_of_service,
      checked_by,
    } = body;

    if (!clinic_id || !patient_id) {
      return NextResponse.json(
        { error: 'clinic_id and patient_id are required' },
        { status: 400 }
      );
    }

    // Fetch patient info
    const { data: patient } = await client
      .from('patients')
      .select('*')
      .eq('id', patient_id)
      .single();

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Fetch clinic billing info
    const { data: clinic } = await client
      .from('clinics')
      .select('*')
      .eq('id', clinic_id)
      .single();

    if (!clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    const effectiveMedicaidId = medicaid_id || patient.medicaid_id || patient.insurance_id || '';
    const effectiveDate = date_of_service || new Date().toISOString().split('T')[0];

    // ──────────────────────────────────────────────────────────────────────
    // Manual fallback: AVAILITY_ENABLED !== 'true'
    // ──────────────────────────────────────────────────────────────────────
    if (process.env.AVAILITY_ENABLED !== 'true') {
      const portalUrl = process.env.AVAILITY_PORTAL_URL || 'https://apps.availity.com';

      // Log the manual check attempt
      const { data: check } = await client
        .from('eligibility_checks')
        .insert({
          clinic_id,
          patient_id,
          medicaid_id: effectiveMedicaidId || null,
          patient_first_name: patient.first_name,
          patient_last_name: patient.last_name,
          patient_dob: patient.date_of_birth || null,
          check_date: effectiveDate,
          service_type: service_type || '30',
          status: 'manual_required',
          checked_by: checked_by || null,
        })
        .select()
        .single();

      return NextResponse.json({
        check,
        mode: 'manual',
        result: {
          status: 'manual_required',
          portalUrl,
          medicaidId: effectiveMedicaidId || null,
          message:
            'Automated eligibility verification is not yet active. Please check manually via Availity portal.',
        },
      }, { status: 201 });
    }

    // ──────────────────────────────────────────────────────────────────────
    // Automated check: AVAILITY_ENABLED === 'true'
    // ──────────────────────────────────────────────────────────────────────

    if (!effectiveMedicaidId) {
      return NextResponse.json(
        { error: 'Patient Medicaid ID is required. Update the patient record with their Medicaid ID.' },
        { status: 400 }
      );
    }

    if (!patient.date_of_birth) {
      return NextResponse.json(
        { error: 'Patient date of birth is required for eligibility checks.' },
        { status: 400 }
      );
    }

    // Resolve payer/trading partner ID
    const payerKey = clinic.payer_trading_partner_id || clinic.payer_name || 'medicaid';
    const tradingPartnerId = resolvePayerId(payerKey);

    if (!tradingPartnerId) {
      return NextResponse.json(
        { error: 'Payer not supported for automated eligibility. Please check manually via the Availity portal.' },
        { status: 400 }
      );
    }

    const npi = process.env.AVAILITY_NPI || clinic.billing_npi;
    const taxId = process.env.AVAILITY_TAX_ID || '';

    if (!npi || npi.length < 2) {
      return NextResponse.json(
        { error: 'NPI is required. Set AVAILITY_NPI or configure Billing NPI in Settings > Billing.' },
        { status: 400 }
      );
    }

    try {
      const result = await checkAvailityEligibility({
        controlNumber: generateControlNumber(),
        tradingPartnerId,
        provider: {
          npi,
          taxId,
          serviceProviderNumber: npi,
        },
        subscriber: {
          memberId: effectiveMedicaidId,
          firstName: patient.first_name,
          lastName: patient.last_name,
          dateOfBirth: toAvailityDate(patient.date_of_birth),
          gender: patient.gender?.toLowerCase() === 'female' ? 'F' : 'M',
        },
        serviceTypeCode: service_type || '30',
      });

      // Map Availity status to legacy status for DB compatibility
      const dbStatus = result.status === 'active' ? 'eligible'
        : result.status === 'inactive' ? 'ineligible'
        : 'error';

      const { data: check, error: checkError } = await client
        .from('eligibility_checks')
        .insert({
          clinic_id,
          patient_id,
          medicaid_id: effectiveMedicaidId,
          patient_first_name: patient.first_name,
          patient_last_name: patient.last_name,
          patient_dob: patient.date_of_birth || null,
          check_date: effectiveDate,
          service_type: service_type || '30',
          status: dbStatus,
          response_data: {
            availity: result.rawResponse,
            parsed: {
              status: result.status,
              payerName: result.payerName,
              planName: result.planName,
              memberId: result.memberId,
              groupNumber: result.groupNumber,
              effectiveDate: result.effectiveDate,
              terminationDate: result.terminationDate,
              copay: result.copay,
              deductible: result.deductible,
              summary: result.status === 'active'
                ? `Active coverage${result.planName ? ` — ${result.planName}` : ''}`
                : result.status === 'inactive'
                ? 'No active coverage found'
                : result.message || 'Unable to verify eligibility',
              details: [
                result.payerName ? `Payer: ${result.payerName}` : null,
                result.planName ? `Plan: ${result.planName}` : null,
                result.memberId ? `Member ID: ${result.memberId}` : null,
                result.groupNumber ? `Group: ${result.groupNumber}` : null,
                result.effectiveDate ? `Effective: ${result.effectiveDate}` : null,
                result.terminationDate ? `Termination: ${result.terminationDate}` : null,
                result.copay ? `Copay: ${result.copay}` : null,
                result.deductible ? `Deductible: ${result.deductible}` : null,
              ].filter(Boolean),
            },
          },
          checked_by: checked_by || null,
        })
        .select()
        .single();

      if (checkError) {
        console.error('Error saving eligibility check:', checkError.code);
        return NextResponse.json({ error: checkError.message }, { status: 500 });
      }

      return NextResponse.json({
        check,
        mode: 'realtime',
        result: {
          status: result.status,
          payerName: result.payerName,
          planName: result.planName,
          memberId: result.memberId,
          groupNumber: result.groupNumber,
          effectiveDate: result.effectiveDate,
          terminationDate: result.terminationDate,
          copay: result.copay,
          deductible: result.deductible,
          summary: result.status === 'active'
            ? `Active coverage${result.planName ? ` — ${result.planName}` : ''}`
            : result.status === 'inactive'
            ? 'No active coverage found'
            : result.message || 'Unable to verify eligibility',
          details: [],
        },
      }, { status: 201 });
    } catch (error) {
      // Log error code only — no PHI
      const errorMessage = error instanceof AvailityError
        ? error.message
        : error instanceof Error ? error.message : 'Unknown error';

      console.error('Availity eligibility check failed:', error instanceof AvailityError ? error.statusCode : 'unknown');

      const { data: check } = await client
        .from('eligibility_checks')
        .insert({
          clinic_id,
          patient_id,
          medicaid_id: effectiveMedicaidId,
          patient_first_name: patient.first_name,
          patient_last_name: patient.last_name,
          patient_dob: patient.date_of_birth || null,
          check_date: effectiveDate,
          service_type: service_type || '30',
          status: 'error',
          error_message: errorMessage,
          checked_by: checked_by || null,
        })
        .select()
        .single();

      return NextResponse.json({
        check,
        mode: 'realtime',
        result: {
          status: 'error',
          summary: errorMessage,
          details: [],
          portalUrl: process.env.AVAILITY_PORTAL_URL || 'https://apps.availity.com',
        },
      }, { status: 201 });
    }
  } catch (error) {
    console.error('Error in POST /api/eligibility/check:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
