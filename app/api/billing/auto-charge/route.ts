/**
 * Auto-Charge & Claim Creation API
 * POST: One-click billing — creates visit_charges and a draft claim from confirmed CPT codes.
 *
 * Input: {
 *   visit_id, note_id, patient_id, episode_id, clinic_id, date_of_service,
 *   diagnosis_codes, rendering_provider_npi, rendering_provider_name,
 *   payer_name, payer_id, subscriber_id,
 *   lines: Array<{ cpt_code, cpt_code_id, units, minutes, modifier_1, modifier_2, charge_amount, is_timed, diagnosis_pointer }>
 * }
 * Output: { charges: VisitCharge[], claim: Claim }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const body = await request.json();
    const {
      visit_id,
      note_id,
      patient_id,
      episode_id,
      clinic_id,
      date_of_service,
      diagnosis_codes,
      rendering_provider_npi,
      rendering_provider_name,
      payer_name,
      payer_id,
      subscriber_id,
      place_of_service,
      created_by,
      lines,
    } = body;

    if (!patient_id || !clinic_id || !date_of_service || !lines || lines.length === 0) {
      return NextResponse.json(
        { error: 'patient_id, clinic_id, date_of_service, and at least one line are required' },
        { status: 400 }
      );
    }

    // 1. Create visit_charges for each confirmed CPT line
    const chargeInserts = lines.map((line: {
      cpt_code: string;
      cpt_code_id: string;
      description?: string;
      units: number;
      minutes?: number;
      modifier_1?: string | null;
      modifier_2?: string | null;
      charge_amount?: number;
      is_timed?: boolean;
      diagnosis_pointer?: number[];
    }) => ({
      visit_id: visit_id || null,
      document_id: note_id || null,
      episode_id: episode_id || null,
      patient_id,
      clinic_id,
      cpt_code_id: line.cpt_code_id,
      cpt_code: line.cpt_code,
      description: line.description || null,
      minutes_spent: line.minutes || null,
      units: line.units || 1,
      modifier_1: line.modifier_1 || null,
      modifier_2: line.modifier_2 || null,
      diagnosis_pointer: line.diagnosis_pointer || [1],
      charge_amount: line.charge_amount || 0,
      date_of_service,
      status: 'pending',
      created_by: created_by || null,
    }));

    const { data: charges, error: chargesError } = await client
      .from('visit_charges')
      .insert(chargeInserts)
      .select();

    if (chargesError) {
      console.error('Error creating charges:', chargesError);
      return NextResponse.json({ error: chargesError.message }, { status: 500 });
    }

    // 2. Calculate total charges
    const totalCharges = (charges || []).reduce(
      (sum: number, c: { charge_amount?: number | null }) => sum + (Number(c.charge_amount) || 0),
      0
    );

    // 3. Create draft claim
    const claimNumber = `CLM-${Date.now().toString(36).toUpperCase()}`;

    const { data: claim, error: claimError } = await client
      .from('claims')
      .insert({
        clinic_id,
        patient_id,
        episode_id: episode_id || null,
        claim_number: claimNumber,
        payer_name: payer_name || 'Texas Medicaid',
        payer_id: payer_id || '330897513',
        subscriber_id: subscriber_id || null,
        total_charges: totalCharges,
        diagnosis_codes: diagnosis_codes || null,
        rendering_provider_npi: rendering_provider_npi || null,
        rendering_provider_name: rendering_provider_name || null,
        place_of_service: place_of_service || '11',
        status: 'draft',
        notes: `Auto-generated from note finalization${note_id ? ` (note: ${note_id})` : ''}`,
        created_by: created_by || null,
      })
      .select()
      .single();

    if (claimError) {
      console.error('Error creating claim:', claimError);
      return NextResponse.json({ error: claimError.message }, { status: 500 });
    }

    // 4. Create claim_lines from charges
    const claimLines = (charges || []).map((charge: {
      id: string;
      cpt_code: string;
      modifier_1?: string | null;
      modifier_2?: string | null;
      units: number;
      charge_amount?: number | null;
      diagnosis_pointer?: number[] | null;
      date_of_service: string;
      description?: string | null;
    }, idx: number) => ({
      claim_id: claim.id,
      visit_charge_id: charge.id,
      line_number: idx + 1,
      cpt_code: charge.cpt_code,
      modifier_1: charge.modifier_1 || null,
      modifier_2: charge.modifier_2 || null,
      units: charge.units || 1,
      charge_amount: charge.charge_amount || 0,
      diagnosis_pointers: charge.diagnosis_pointer || [1],
      date_of_service: charge.date_of_service,
      description: charge.description || null,
    }));

    const { error: linesError } = await client
      .from('claim_lines')
      .insert(claimLines);

    if (linesError) {
      console.error('Error creating claim lines:', linesError);
      // Non-fatal — charges and claim already created
    }

    // 5. Fetch complete claim with lines
    const { data: completeClaim } = await client
      .from('claims')
      .select('*, claim_lines(*)')
      .eq('id', claim.id)
      .single();

    return NextResponse.json({
      charges,
      claim: completeClaim || claim,
    }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/billing/auto-charge:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
