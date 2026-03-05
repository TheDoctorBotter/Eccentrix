/**
 * Patient Episode of Care API (per-discipline tracking)
 * GET:    List episode-of-care records (query: episode_id, patient_id?, clinic_id?, discipline?)
 * POST:   Create a per-discipline episode-of-care record
 * PATCH:  Update an existing record (body includes id)
 * DELETE: Remove a record (body: { id })
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const { searchParams } = new URL(request.url);
    const episodeId = searchParams.get('episode_id');
    const patientId = searchParams.get('patient_id');
    const clinicId = searchParams.get('clinic_id');
    const discipline = searchParams.get('discipline');

    if (!episodeId && !patientId) {
      return NextResponse.json(
        { error: 'episode_id or patient_id is required' },
        { status: 400 }
      );
    }

    let query = client
      .from('patient_episode_of_care')
      .select('*')
      .order('discipline', { ascending: true });

    if (episodeId) query = query.eq('episode_id', episodeId);
    if (patientId) query = query.eq('patient_id', patientId);
    if (clinicId) query = query.eq('clinic_id', clinicId);
    if (discipline) query = query.eq('discipline', discipline);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching episode-of-care records:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Error in GET /api/episode-of-care:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const body = await request.json();
    const { patient_id, episode_id, clinic_id, discipline, frequency, start_date, end_date, notes } = body;

    if (!patient_id || !episode_id || !clinic_id || !discipline) {
      return NextResponse.json(
        { error: 'patient_id, episode_id, clinic_id, and discipline are required' },
        { status: 400 }
      );
    }

    if (!['PT', 'OT', 'ST'].includes(discipline)) {
      return NextResponse.json(
        { error: 'discipline must be PT, OT, or ST' },
        { status: 400 }
      );
    }

    const { data, error } = await client
      .from('patient_episode_of_care')
      .upsert(
        {
          patient_id,
          episode_id,
          clinic_id,
          discipline,
          frequency: frequency || null,
          start_date: start_date || null,
          end_date: end_date || null,
          notes: notes || null,
          status: 'active',
        },
        { onConflict: 'episode_id,discipline' }
      )
      .select()
      .single();

    if (error) {
      console.error('Error creating episode-of-care:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/episode-of-care:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const allowedFields = ['frequency', 'start_date', 'end_date', 'status', 'notes'];
    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data, error } = await client
      .from('patient_episode_of_care')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating episode-of-care:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in PATCH /api/episode-of-care:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { error } = await client
      .from('patient_episode_of_care')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting episode-of-care:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/episode-of-care:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
