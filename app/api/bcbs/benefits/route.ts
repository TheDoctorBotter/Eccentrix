/**
 * GET  /api/bcbs/benefits?clinic_id=...&patient_id=...&active_only=true
 * POST /api/bcbs/benefits — Create a new BCBS benefit period
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
    const activeOnly = searchParams.get('active_only') !== 'false';

    if (!clinicId) {
      return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });
    }

    let query = client
      .from('bcbs_visit_benefits')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('benefit_year_start', { ascending: false });

    if (patientId) {
      query = query.eq('patient_id', patientId);
    }

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching BCBS benefits:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Error in GET /api/bcbs/benefits:', error);
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
      benefit_year_start,
      benefit_year_end,
      benefit_type,
      total_visits_allowed,
      pt_visits_allowed,
      ot_visits_allowed,
      st_visits_allowed,
      bcbs_member_id,
      bcbs_group_number,
      bcbs_plan_name,
      notes,
      created_by,
    } = body;

    if (!clinic_id || !patient_id || !benefit_year_start || !benefit_year_end) {
      return NextResponse.json(
        { error: 'clinic_id, patient_id, benefit_year_start, and benefit_year_end are required' },
        { status: 400 },
      );
    }

    const insertPayload = {
      clinic_id,
      patient_id,
      benefit_year_start,
      benefit_year_end,
      benefit_type: benefit_type || 'pooled',
      total_visits_allowed: benefit_type === 'pooled' ? (total_visits_allowed ?? null) : null,
      pt_visits_allowed: benefit_type === 'split' ? (pt_visits_allowed ?? null) : null,
      ot_visits_allowed: benefit_type === 'split' ? (ot_visits_allowed ?? null) : null,
      st_visits_allowed: benefit_type === 'split' ? (st_visits_allowed ?? null) : null,
      bcbs_member_id: bcbs_member_id || null,
      bcbs_group_number: bcbs_group_number || null,
      bcbs_plan_name: bcbs_plan_name || null,
      notes: notes || null,
      created_by: created_by || null,
    };

    const { data, error } = await client
      .from('bcbs_visit_benefits')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error('Error creating BCBS benefit:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/bcbs/benefits:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
