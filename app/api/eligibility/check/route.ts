/**
 * Eligibility Check API
 * POST: Check patient eligibility via Stedi API (real-time) or generate 270 EDI file (fallback)
 *
 * If STEDI_API_KEY env var is set (or clinic has stedi_api_key), does a real-time check.
 * Otherwise, generates a 270 EDI file for manual clearinghouse upload.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';
import { generate270 } from '@/lib/edi/generate-270';
import {
  getStediConfig,
  checkEligibility,
  parseEligibilityStatus,
  toStediDate,
  StediError,
} from '@/lib/stedi-client';

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

    if (!effectiveMedicaidId) {
      return NextResponse.json(
        { error: 'Patient Medicaid ID is required. Update the patient record with their Medicaid ID.' },
        { status: 400 }
      );
    }

    const effectiveDate = date_of_service || new Date().toISOString().split('T')[0];

    // Try Stedi real-time check first
    const stediConfig = getStediConfig(clinic.stedi_api_key);

    if (stediConfig) {
      // ===== Real-time eligibility via Stedi =====
      try {
        const stediResponse = await checkEligibility(stediConfig, {
          tradingPartnerServiceId: clinic.payer_trading_partner_id || 'TXMCD',
          provider: {
            organizationName: clinic.name,
            npi: clinic.billing_npi || '',
          },
          subscriber: {
            memberId: effectiveMedicaidId,
            firstName: patient.first_name,
            lastName: patient.last_name,
            dateOfBirth: toStediDate(patient.date_of_birth || ''),
            gender: patient.gender === 'female' ? 'F' : patient.gender === 'male' ? 'M' : 'U',
          },
          encounter: {
            serviceTypeCodes: [service_type || '30'],
          },
        });

        const parsed = parseEligibilityStatus(stediResponse);

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
            status: parsed.status,
            response_data: { ...stediResponse, parsed },
            checked_by: checked_by || null,
          })
          .select()
          .single();

        if (checkError) {
          console.error('Error saving eligibility check:', checkError);
          return NextResponse.json({ error: checkError.message }, { status: 500 });
        }

        return NextResponse.json({ check, mode: 'realtime', result: parsed }, { status: 201 });
      } catch (error) {
        console.error('Stedi eligibility check failed:', error);
        const errorMessage = error instanceof StediError
          ? `${error.message}: ${error.responseBody}`
          : error instanceof Error ? error.message : 'Unknown error';

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
          result: { status: 'error', summary: errorMessage, details: [] },
        }, { status: 201 });
      }
    }

    // ===== Fallback: Generate 270 EDI file for manual submission =====
    const edi270Content = generate270({
      payerName: 'Texas Medicaid',
      payerId: '330897513',
      submitterId: clinic.submitter_id || clinic.billing_npi || '',
      providerName: clinic.name,
      providerNpi: clinic.billing_npi || '',
      subscriberId: effectiveMedicaidId,
      patientLastName: patient.last_name,
      patientFirstName: patient.first_name,
      patientDob: patient.date_of_birth || '',
      patientGender: patient.gender || 'unknown',
      dateOfService: effectiveDate,
      serviceTypeCode: service_type || '30',
    });

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
        status: 'pending',
        edi_270_content: edi270Content,
        checked_by: checked_by || null,
      })
      .select()
      .single();

    if (checkError) {
      console.error('Error creating eligibility check:', checkError);
      return NextResponse.json({ error: checkError.message }, { status: 500 });
    }

    return NextResponse.json({
      check,
      mode: 'file',
      edi_270_content: edi270Content,
    }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/eligibility/check:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
