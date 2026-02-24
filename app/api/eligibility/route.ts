/**
 * Eligibility Checks API
 * GET: List eligibility checks (filter by clinic_id, patient_id)
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

    let query = client
      .from('eligibility_checks')
      .select('*')
      .order('created_at', { ascending: false });

    if (clinicId) query = query.eq('clinic_id', clinicId);
    if (patientId) query = query.eq('patient_id', patientId);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching eligibility checks:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Error in GET /api/eligibility:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
