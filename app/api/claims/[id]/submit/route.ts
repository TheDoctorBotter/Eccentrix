/**
 * Submit Claim via Stedi API
 * POST: Submits an 837P claim through Stedi clearinghouse for real-time processing
 *
 * Falls back to marking as "submitted" (manual) if Stedi is not configured.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';
import {
  getStediConfig,
  submitClaim,
  toStediDate,
  StediError,
  StediClaimRequest,
} from '@/lib/stedi-client';

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

    // Fetch clinic
    const { data: clinic } = await client
      .from('clinics')
      .select('*')
      .eq('id', claim.clinic_id)
      .single();

    if (!clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    // Fetch patient
    const { data: patient } = await client
      .from('patients')
      .select('*')
      .eq('id', claim.patient_id)
      .single();

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    const stediConfig = getStediConfig(clinic.stedi_api_key);

    if (!stediConfig) {
      // No Stedi configured - just mark as submitted (manual flow)
      const { data: updated } = await client
        .from('claims')
        .update({
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*, claim_lines(*)')
        .single();

      return NextResponse.json({
        claim: updated,
        mode: 'manual',
        message: 'Claim marked as submitted. Upload the 837P file to your clearinghouse manually.',
      });
    }

    // ===== Submit via Stedi API =====
    const sortedLines = (claim.claim_lines || []).sort(
      (a: { line_number: number }, b: { line_number: number }) => a.line_number - b.line_number
    );

    // Parse rendering provider name
    let renderingLastName = '';
    let renderingFirstName = '';
    if (claim.rendering_provider_name) {
      const parts = claim.rendering_provider_name.split(',').map((s: string) => s.trim());
      renderingLastName = parts[0] || '';
      renderingFirstName = parts[1] || '';
    }

    const subscriberId = claim.subscriber_id || patient.medicaid_id || patient.insurance_id || '';

    const stediRequest: StediClaimRequest = {
      tradingPartnerServiceId: clinic.payer_trading_partner_id || 'TXMCD',
      submitter: {
        organizationName: clinic.name,
        contactInformation: {
          name: clinic.name,
          phoneNumber: (clinic.phone || '0000000000').replace(/\D/g, ''),
        },
      },
      receiver: {
        organizationName: claim.payer_name || 'Texas Medicaid',
      },
      billing: {
        providerType: 'billing',
        npi: clinic.billing_npi || '',
        employerId: (clinic.tax_id || '').replace(/\D/g, ''),
        organizationName: clinic.name,
        address: {
          address1: clinic.billing_address || clinic.address || '',
          city: clinic.billing_city || '',
          state: clinic.billing_state || 'TX',
          postalCode: (clinic.billing_zip || '').replace(/\D/g, ''),
        },
        taxonomyCode: clinic.taxonomy_code || '225100000X',
      },
      subscriber: {
        memberId: subscriberId,
        paymentResponsibilityLevelCode: 'P',
        firstName: patient.first_name,
        lastName: patient.last_name,
        gender: patient.gender?.toLowerCase() === 'female' ? 'F' : 'M',
        dateOfBirth: toStediDate(patient.date_of_birth || ''),
        payer: {
          organizationName: claim.payer_name || 'Texas Medicaid',
          payerId: claim.payer_id || '330897513',
        },
      },
      claimInformation: {
        claimFilingCode: 'MC',
        patientControlNumber: claim.claim_number || claim.id.slice(0, 20),
        claimChargeAmount: String(Number(claim.total_charges || 0).toFixed(2)),
        placeOfServiceCode: claim.place_of_service || '11',
        claimFrequencyCode: '1',
        signatureIndicator: 'Y',
        planParticipationCode: 'A',
        releaseInformationCode: 'Y',
        benefitsAssignmentCertificationIndicator: 'Y',
        healthCareCodeInformation: (claim.diagnosis_codes || []).map(
          (code: string, idx: number) => ({
            diagnosisTypeCode: idx === 0 ? 'ABK' as const : 'ABF' as const,
            diagnosisCode: code.replace('.', ''),
          })
        ),
        serviceLines: sortedLines.map((line: {
          cpt_code: string;
          modifier_1?: string | null;
          modifier_2?: string | null;
          charge_amount: number;
          units: number;
          diagnosis_pointers?: number[] | null;
          date_of_service: string;
        }) => ({
          serviceDate: toStediDate(line.date_of_service),
          professionalService: {
            procedureIdentifier: 'HC' as const,
            procedureCode: line.cpt_code,
            procedureModifiers: [line.modifier_1, line.modifier_2].filter(Boolean) as string[],
            lineItemChargeAmount: String(Number(line.charge_amount || 0).toFixed(2)),
            measurementUnit: 'UN' as const,
            serviceUnitCount: String(Number(line.units) || 1),
            compositeDiagnosisCodePointers: {
              diagnosisCodePointers: (line.diagnosis_pointers || [1]).map(String),
            },
          },
        })),
      },
    };

    // Add rendering provider if specified
    if (claim.rendering_provider_npi) {
      stediRequest.rendering = {
        providerType: 'rendering',
        npi: claim.rendering_provider_npi,
        firstName: renderingFirstName,
        lastName: renderingLastName,
        taxonomyCode: clinic.taxonomy_code || '225100000X',
      };
    }

    try {
      const stediResponse = await submitClaim(stediConfig, stediRequest);

      const newStatus = stediResponse.errors && stediResponse.errors.length > 0
        ? 'rejected'
        : 'submitted';

      const { data: updated } = await client
        .from('claims')
        .update({
          status: newStatus,
          submitted_at: new Date().toISOString(),
          notes: stediResponse.errors
            ? `Stedi errors: ${stediResponse.errors.map((e) => e.description).join('; ')}`
            : `Submitted via Stedi. Claim ID: ${stediResponse.claimId || 'N/A'}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*, claim_lines(*)')
        .single();

      return NextResponse.json({
        claim: updated,
        mode: 'stedi',
        stediResponse,
        message: newStatus === 'submitted'
          ? 'Claim submitted successfully via Stedi'
          : `Claim rejected: ${stediResponse.errors?.map((e) => e.description).join('; ')}`,
      });
    } catch (error) {
      console.error('Stedi claim submission failed:', error);
      const errorMessage = error instanceof StediError
        ? error.responseBody
        : error instanceof Error ? error.message : 'Unknown error';

      return NextResponse.json({
        error: `Stedi submission failed: ${errorMessage}`,
        mode: 'stedi',
      }, { status: 502 });
    }
  } catch (error) {
    console.error('Error in POST /api/claims/[id]/submit:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
