/**
 * Generate 837P EDI File for a Claim
 * POST: Generates the 837P EDI content and stores it on the claim
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';
import { generate837P, Claim837PData, ServiceLine837P } from '@/lib/edi/generate-837p';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    // Fetch claim with lines
    const { data: claim, error: claimError } = await client
      .from('claims')
      .select('*, claim_lines(*)')
      .eq('id', id)
      .single();

    if (claimError || !claim) {
      return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
    }

    // Fetch clinic billing settings
    const { data: clinic, error: clinicError } = await client
      .from('clinics')
      .select('*')
      .eq('id', claim.clinic_id)
      .single();

    if (clinicError || !clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    // Validate required billing fields
    const missingFields: string[] = [];
    if (!clinic.billing_npi && !clinic.tax_id) missingFields.push('Billing NPI or Tax ID');
    if (!clinic.name) missingFields.push('Clinic Name');

    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Missing required billing settings: ${missingFields.join(', ')}. Configure in Settings > Billing.` },
        { status: 400 }
      );
    }

    // Fetch patient info
    const { data: patient } = await client
      .from('patients')
      .select('*')
      .eq('id', claim.patient_id)
      .single();

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Build service lines
    const sortedLines = (claim.claim_lines || []).sort(
      (a: { line_number: number }, b: { line_number: number }) => a.line_number - b.line_number
    );

    const serviceLines: ServiceLine837P[] = sortedLines.map((line: {
      line_number: number;
      cpt_code: string;
      modifier_1?: string | null;
      modifier_2?: string | null;
      charge_amount: number;
      units: number;
      diagnosis_pointers?: number[] | null;
      date_of_service: string;
    }) => ({
      lineNumber: line.line_number,
      cptCode: line.cpt_code,
      modifier1: line.modifier_1 || undefined,
      modifier2: line.modifier_2 || undefined,
      chargeAmount: Number(line.charge_amount) || 0,
      units: Number(line.units) || 1,
      diagnosisPointers: line.diagnosis_pointers || [1],
      dateOfService: line.date_of_service,
    }));

    // Parse rendering provider name if available
    let renderingLastName = '';
    let renderingFirstName = '';
    if (claim.rendering_provider_name) {
      const parts = claim.rendering_provider_name.split(',').map((s: string) => s.trim());
      renderingLastName = parts[0] || '';
      renderingFirstName = parts[1] || '';
    }

    // Build 837P data
    const claimData: Claim837PData = {
      submitterId: clinic.submitter_id || clinic.billing_npi || clinic.tax_id || '',
      submitterName: clinic.name,
      submitterContactName: clinic.name,
      submitterPhone: clinic.phone || '0000000000',
      billingProviderNpi: clinic.billing_npi || '',
      billingProviderTaxId: clinic.tax_id || '',
      billingProviderTaxonomy: clinic.taxonomy_code || '225100000X', // Default PT taxonomy
      billingProviderName: clinic.name,
      billingProviderAddress: clinic.billing_address || clinic.address || '',
      billingProviderCity: clinic.billing_city || '',
      billingProviderState: clinic.billing_state || 'TX',
      billingProviderZip: clinic.billing_zip || '',

      receiverId: claim.payer_id || '330897513',
      receiverName: claim.payer_name || 'TMHP',

      subscriberId: claim.subscriber_id || patient.medicaid_id || patient.insurance_id || '',
      patientLastName: patient.last_name,
      patientFirstName: patient.first_name,
      patientDob: patient.date_of_birth || '',
      patientGender: patient.gender || 'unknown',
      patientAddress: patient.address || '',
      patientCity: '',
      patientState: 'TX',
      patientZip: '',

      payerName: claim.payer_name || 'Texas Medicaid',
      payerId: claim.payer_id || '330897513',

      claimId: claim.claim_number || claim.id,
      totalChargeAmount: Number(claim.total_charges) || 0,
      placeOfService: claim.place_of_service || '11',
      diagnosisCodes: claim.diagnosis_codes || [],

      renderingProviderNpi: claim.rendering_provider_npi || undefined,
      renderingProviderLastName: renderingLastName || undefined,
      renderingProviderFirstName: renderingFirstName || undefined,

      serviceLines,
    };

    // Generate the 837P file
    const ediContent = generate837P(claimData);

    // Update the claim with EDI content
    const { data: updatedClaim, error: updateError } = await client
      .from('claims')
      .update({
        edi_file_content: ediContent,
        edi_generated_at: new Date().toISOString(),
        status: claim.status === 'draft' ? 'generated' : claim.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*, claim_lines(*)')
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      claim: updatedClaim,
      edi_content: ediContent,
    });
  } catch (error) {
    console.error('Error in POST /api/claims/[id]/generate-edi:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
