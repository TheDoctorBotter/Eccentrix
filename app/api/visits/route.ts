/**
 * Visits API – scheduling scaffold
 * GET:  List visits for a clinic (filterable by date range)
 * POST: Manually create a visit (admin / front_office / PT only)
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
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (!clinicId) {
      return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });
    }

    let query = client
      .from('visits')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('start_time', { ascending: true });

    if (from) {
      query = query.gte('start_time', from);
    }
    if (to) {
      query = query.lte('start_time', to);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching visits:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Error in GET /api/visits:', error);
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
      episode_id,
      patient_id,
      therapist_user_id,
      start_time,
      end_time,
      location,
      source,
      external_event_id,
      notes,
    } = body;

    if (!clinic_id || !start_time || !end_time) {
      return NextResponse.json(
        { error: 'clinic_id, start_time, and end_time are required' },
        { status: 400 }
      );
    }

    const { data, error } = await client
      .from('visits')
      .insert({
        clinic_id,
        episode_id: episode_id || null,
        patient_id: patient_id || null,
        therapist_user_id: therapist_user_id || null,
        start_time,
        end_time,
        location: location || null,
        source: source || 'manual',
        external_event_id: external_event_id || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating visit:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/visits:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
