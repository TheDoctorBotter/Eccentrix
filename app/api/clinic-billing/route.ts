/**
 * Clinic Billing Settings API
 * GET:  Get billing settings for a clinic
 * PATCH: Update billing settings
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

    if (!clinicId) {
      return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });
    }

    const { data, error } = await client
      .from('clinics')
      .select('id, name, tax_id, taxonomy_code, medicaid_provider_id, billing_npi, billing_address, billing_city, billing_state, billing_zip, submitter_id')
      .eq('id', clinicId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in GET /api/clinic-billing:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const body = await request.json();
    const { clinic_id, ...fields } = body;

    if (!clinic_id) {
      return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });
    }

    const allowedFields = [
      'tax_id', 'taxonomy_code', 'medicaid_provider_id',
      'billing_npi', 'billing_address', 'billing_city',
      'billing_state', 'billing_zip', 'submitter_id',
    ];

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const field of allowedFields) {
      if (fields[field] !== undefined) {
        updateData[field] = fields[field] || null;
      }
    }

    const { data, error } = await client
      .from('clinics')
      .update(updateData)
      .eq('id', clinic_id)
      .select('id, name, tax_id, taxonomy_code, medicaid_provider_id, billing_npi, billing_address, billing_city, billing_state, billing_zip, submitter_id')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in PATCH /api/clinic-billing:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
