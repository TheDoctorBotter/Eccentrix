/**
 * GET /api/bcbs/log?benefit_id=...
 * Fetch BCBS visit usage log for a benefit, sorted newest first.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const { searchParams } = new URL(request.url);
    const benefitId = searchParams.get('benefit_id');

    if (!benefitId) {
      return NextResponse.json({ error: 'benefit_id is required' }, { status: 400 });
    }

    const { data, error } = await client
      .from('bcbs_visit_log')
      .select('*')
      .eq('benefit_id', benefitId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching BCBS visit log:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Error in GET /api/bcbs/log:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
