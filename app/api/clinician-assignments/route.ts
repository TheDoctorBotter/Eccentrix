/**
 * Patient Clinician Assignments API
 * GET:    List assignments for a patient (query: patient_id, clinic_id, discipline?)
 * POST:   Assign a clinician to a patient
 * DELETE:  Remove an assignment (body: { id } or { patient_id, user_id, discipline })
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get('patient_id');
    const clinicId = searchParams.get('clinic_id');
    const discipline = searchParams.get('discipline');

    if (!patientId || !clinicId) {
      return NextResponse.json(
        { error: 'patient_id and clinic_id are required' },
        { status: 400 }
      );
    }

    let query = client
      .from('patient_clinician_assignments')
      .select('*')
      .eq('patient_id', patientId)
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .order('discipline', { ascending: true });

    if (discipline) {
      query = query.eq('discipline', discipline);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching clinician assignments:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Error in GET /api/clinician-assignments:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const body = await request.json();
    const { patient_id, clinic_id, user_id, discipline, role } = body;

    if (!patient_id || !clinic_id || !user_id || !discipline || !role) {
      return NextResponse.json(
        { error: 'patient_id, clinic_id, user_id, discipline, and role are required' },
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
      .from('patient_clinician_assignments')
      .upsert(
        { patient_id, clinic_id, user_id, discipline, role, is_active: true },
        { onConflict: 'patient_id,user_id,discipline' }
      )
      .select()
      .single();

    if (error) {
      console.error('Error creating clinician assignment:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/clinician-assignments:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const body = await request.json();
    const { id, patient_id, user_id, discipline } = body;

    if (!id && !(patient_id && user_id && discipline)) {
      return NextResponse.json(
        { error: 'id or (patient_id, user_id, discipline) required' },
        { status: 400 }
      );
    }

    let query = client.from('patient_clinician_assignments').delete();

    if (id) {
      query = query.eq('id', id);
    } else {
      query = query
        .eq('patient_id', patient_id)
        .eq('user_id', user_id)
        .eq('discipline', discipline);
    }

    const { error } = await query;

    if (error) {
      console.error('Error deleting clinician assignment:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/clinician-assignments:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
