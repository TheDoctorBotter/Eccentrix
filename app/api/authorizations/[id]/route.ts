/**
 * Prior Authorization by ID API
 * PATCH:  Update authorization (status, used_visits, etc.)
 * DELETE: Remove an authorization
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const { id } = params;
    const body = await request.json();

    // remaining_visits is GENERATED — never write to it directly
    const allowedFields = [
      'auth_number',
      'insurance_name',
      'insurance_phone',
      'authorized_visits',
      'used_visits',
      'start_date',
      'end_date',
      'requested_date',
      'approved_date',
      'status',
      'notes',
      'discipline',
      'auth_type',
      'units_authorized',
      'units_used',
      'day_180_date',
      'alert_30_dismissed_at',
      'alert_15_dismissed_at',
      'updated_at',
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const { data, error } = await client
      .from('prior_authorizations')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating authorization:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in PATCH /api/authorizations/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const { id } = params;

    const { error } = await client
      .from('prior_authorizations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting authorization:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/authorizations/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
