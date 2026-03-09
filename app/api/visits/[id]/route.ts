/**
 * Single Visit API – GET / PATCH / DELETE by visit ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: 'Visit ID is required' }, { status: 400 });
    }

    const { data, error } = await client
      .from('visits')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching visit:', error);
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in GET /api/visits/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: 'Visit ID is required' }, { status: 400 });
    }

    const body = await request.json();

    // Build the update object with only allowed fields
    const allowedFields = [
      'episode_id',
      'patient_id',
      'therapist_user_id',
      'start_time',
      'end_time',
      'location',
      'notes',
      'status',
      'cancelled_at',
      'cancel_reason',
      'visit_type',
      'discipline',
      'total_treatment_minutes',
      'total_units',
      'recurrence_rule',
      'recurrence_group_id',
      'source',
      'auth_id',
      'actual_duration_minutes',
      'shortened_visit_reason',
      'units_used',
      'auth_usage_applied',
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // If status is being set to cancelled, auto-set cancelled_at
    if (updateData.status === 'cancelled' && !updateData.cancelled_at) {
      updateData.cancelled_at = new Date().toISOString();
    }

    const { data, error } = await client
      .from('visits')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating visit:', error);
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in PATCH /api/visits/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: 'Visit ID is required' }, { status: 400 });
    }

    const { error } = await client
      .from('visits')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting visit:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error in DELETE /api/visits/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
