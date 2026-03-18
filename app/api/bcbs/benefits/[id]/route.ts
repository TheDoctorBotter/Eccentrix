/**
 * PATCH /api/bcbs/benefits/[id] — Update a BCBS benefit period
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;
    const { id } = await params;

    const body = await request.json();

    // Allow updating specific fields
    const allowedFields = [
      'benefit_year_start',
      'benefit_year_end',
      'benefit_type',
      'total_visits_allowed',
      'total_visits_used',
      'pt_visits_allowed',
      'pt_visits_used',
      'ot_visits_allowed',
      'ot_visits_used',
      'st_visits_allowed',
      'st_visits_used',
      'bcbs_member_id',
      'bcbs_group_number',
      'bcbs_plan_name',
      'notes',
      'is_active',
      'last_updated_by',
    ];

    const updatePayload: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in body) {
        updatePayload[key] = body[key];
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data, error } = await client
      .from('bcbs_visit_benefits')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating BCBS benefit:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in PATCH /api/bcbs/benefits/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
