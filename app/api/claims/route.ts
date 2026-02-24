/**
 * Claims API
 * GET:  List claims (filter by clinic_id, patient_id, status)
 * POST: Create a claim from selected visit charges
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinic_id');
    const patientId = searchParams.get('patient_id');
    const status = searchParams.get('status');

    let query = client
      .from('claims')
      .select('*, claim_lines(*)')
      .order('created_at', { ascending: false });

    if (clinicId) query = query.eq('clinic_id', clinicId);
    if (patientId) query = query.eq('patient_id', patientId);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching claims:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Error in GET /api/claims:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const body = await request.json();
    const {
      clinic_id,
      patient_id,
      episode_id,
      charge_ids, // array of visit_charge IDs to include
      payer_name,
      payer_id,
      subscriber_id,
      diagnosis_codes,
      rendering_provider_npi,
      rendering_provider_name,
      place_of_service,
      notes,
      created_by,
    } = body;

    if (!clinic_id || !patient_id || !charge_ids || charge_ids.length === 0) {
      return NextResponse.json(
        { error: 'clinic_id, patient_id, and charge_ids are required' },
        { status: 400 }
      );
    }

    // Fetch the selected charges
    const { data: charges, error: chargesError } = await client
      .from('visit_charges')
      .select('*')
      .in('id', charge_ids);

    if (chargesError) {
      return NextResponse.json({ error: chargesError.message }, { status: 500 });
    }

    if (!charges || charges.length === 0) {
      return NextResponse.json({ error: 'No charges found for the given IDs' }, { status: 400 });
    }

    // Calculate total charges
    const totalCharges = charges.reduce(
      (sum: number, c: { charge_amount?: number | null; units?: number }) =>
        sum + (c.charge_amount || 0),
      0
    );

    // Generate claim number
    const claimNumber = `CLM-${Date.now().toString(36).toUpperCase()}`;

    // Create the claim
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
        notes: notes || null,
        created_by: created_by || null,
      })
      .select()
      .single();

    if (claimError) {
      console.error('Error creating claim:', claimError);
      return NextResponse.json({ error: claimError.message }, { status: 500 });
    }

    // Create claim lines from charges
    const claimLines = charges.map((charge: {
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
      // Clean up the claim if lines failed
      await client.from('claims').delete().eq('id', claim.id);
      return NextResponse.json({ error: linesError.message }, { status: 500 });
    }

    // Fetch the complete claim with lines
    const { data: completeClaim } = await client
      .from('claims')
      .select('*, claim_lines(*)')
      .eq('id', claim.id)
      .single();

    return NextResponse.json(completeClaim, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/claims:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
