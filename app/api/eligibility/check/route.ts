/**
 * Eligibility Check API
 * POST: Create an eligibility check record and generate 270 EDI
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';
import { generate270 } from '@/lib/edi/generate-270';

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

    // Generate 270 EDI
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
      dateOfService: date_of_service || new Date().toISOString().split('T')[0],
      serviceTypeCode: service_type || '30',
    });

    // Create eligibility check record
    const { data: check, error: checkError } = await client
      .from('eligibility_checks')
      .insert({
        clinic_id,
        patient_id,
        medicaid_id: effectiveMedicaidId,
        patient_first_name: patient.first_name,
        patient_last_name: patient.last_name,
        patient_dob: patient.date_of_birth || null,
        check_date: date_of_service || new Date().toISOString().split('T')[0],
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
      edi_270_content: edi270Content,
    }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/eligibility/check:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
