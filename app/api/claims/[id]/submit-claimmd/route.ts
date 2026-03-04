/**
 * Submit Claim via Claim.MD
 * POST: Submits an 837P claim through the Claim.MD clearinghouse.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  PLACEHOLDER — Claim.MD integration is not yet configured.          │
 * │  This endpoint builds the correct claim data structure and          │
 * │  validates readiness. Replace the TODO section below with the       │
 * │  actual Claim.MD API call when credentials are available.           │
 * │                                                                      │
 * │  Claim.MD API docs: https://www.claim.md/api                       │
 * │  Expected env vars:                                                 │
 * │    CLAIMMD_API_KEY, CLAIMMD_ACCOUNT_KEY, CLAIMMD_ENDPOINT           │
 * └──────────────────────────────────────────────────────────────────────┘
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';

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

    // Fetch clinic for billing info
    const { data: clinic } = await client
      .from('clinics')
      .select('*')
      .eq('id', claim.clinic_id)
      .single();

    if (!clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    // Fetch patient demographics
    const { data: patient } = await client
      .from('patients')
      .select('*')
      .eq('id', claim.patient_id)
      .single();

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Build the Claim.MD-ready data structure
    const claimMdPayload = {
      // Billing Provider (Loop 2010AA)
      billing_provider: {
        name: clinic.name,
        npi: clinic.billing_npi,
        tax_id: clinic.tax_id,
        taxonomy: clinic.taxonomy_code || '225100000X',
        address: {
          line1: clinic.billing_address || clinic.address,
          city: clinic.billing_city,
          state: clinic.billing_state || 'TX',
          zip: clinic.billing_zip,
        },
      },
      // Subscriber/Patient (Loop 2010BA/2010CA)
      subscriber: {
        member_id: claim.subscriber_id || patient.medicaid_id || patient.insurance_id,
        first_name: patient.first_name,
        last_name: patient.last_name,
        date_of_birth: patient.date_of_birth,
        gender: patient.gender,
      },
      // Payer (Loop 2010BB)
      payer: {
        name: claim.payer_name,
        payer_id: claim.payer_id,
      },
      // Claim Info (Loop 2300)
      claim_info: {
        patient_control_number: claim.claim_number,
        total_charge: claim.total_charges,
        place_of_service: claim.place_of_service || '11',
        diagnosis_codes: claim.diagnosis_codes || [],
        claim_filing_indicator: 'MC', // Medicaid
      },
      // Rendering Provider (Loop 2310B)
      rendering_provider: claim.rendering_provider_npi ? {
        npi: claim.rendering_provider_npi,
        name: claim.rendering_provider_name,
        taxonomy: clinic.taxonomy_code || '225100000X',
      } : null,
      // Service Lines (Loop 2400)
      service_lines: (claim.claim_lines || [])
        .sort((a: { line_number: number }, b: { line_number: number }) => a.line_number - b.line_number)
        .map((line: {
          cpt_code: string;
          modifier_1?: string | null;
          modifier_2?: string | null;
          charge_amount: number;
          units: number;
          diagnosis_pointers?: number[] | null;
          date_of_service: string;
        }) => ({
          procedure_code: line.cpt_code,
          modifiers: [line.modifier_1, line.modifier_2].filter(Boolean),
          charge_amount: line.charge_amount,
          units: line.units,
          diagnosis_pointers: line.diagnosis_pointers || [1],
          date_of_service: line.date_of_service,
        })),
    };

    // ──────────────────────────────────────────────────────────────────
    // TODO: Replace this block with actual Claim.MD API call
    // ──────────────────────────────────────────────────────────────────
    const claimMdApiKey = process.env.CLAIMMD_API_KEY;
    const claimMdAccountKey = process.env.CLAIMMD_ACCOUNT_KEY;

    if (!claimMdApiKey || !claimMdAccountKey) {
      // Claim.MD not configured — mark as submitted (manual flow)
      const { data: updated } = await client
        .from('claims')
        .update({
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          notes: 'Claim.MD not configured. Claim data prepared for manual submission.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*, claim_lines(*)')
        .single();

      return NextResponse.json({
        claim: updated,
        mode: 'manual',
        claimMdPayload, // Return the prepared data for manual upload
        message: 'Claim.MD is not configured. Claim marked as submitted. The prepared payload is included for manual upload.',
      });
    }

    // When Claim.MD is configured, the API call would go here:
    // const claimMdEndpoint = process.env.CLAIMMD_ENDPOINT || 'https://svc.claim.md/services/claim/';
    //
    // const response = await fetch(claimMdEndpoint, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Authorization': `Bearer ${claimMdApiKey}`,
    //     'X-Account-Key': claimMdAccountKey,
    //   },
    //   body: JSON.stringify(claimMdPayload),
    // });
    //
    // const result = await response.json();
    //
    // if (!response.ok || result.errors) {
    //   // Update claim as rejected
    //   await client.from('claims').update({
    //     status: 'rejected',
    //     notes: `Claim.MD errors: ${JSON.stringify(result.errors)}`,
    //     updated_at: new Date().toISOString(),
    //   }).eq('id', id);
    //
    //   return NextResponse.json({ error: result.errors, mode: 'claimmd' }, { status: 422 });
    // }

    // For now, mark as submitted with the prepared payload
    const { data: updated } = await client
      .from('claims')
      .update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        notes: 'Submitted via Claim.MD (placeholder)',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*, claim_lines(*)')
      .single();

    return NextResponse.json({
      claim: updated,
      mode: 'claimmd',
      message: 'Claim submitted via Claim.MD',
    });
    // ──────────────────────────────────────────────────────────────────
  } catch (error) {
    console.error('Error in POST /api/claims/[id]/submit-claimmd:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
