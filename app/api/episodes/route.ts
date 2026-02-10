/**
 * Episodes API
 * GET: List episodes (with patient info) filtered by clinic/status
 * POST: Create a new episode
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
    const status = searchParams.get('status');
    const patientId = searchParams.get('patient_id');

    // Use the active_episodes_view for active episodes with patient info
    if (status === 'active') {
      let query = client
        .from('active_episodes_view')
        .select('*');

      if (clinicId) {
        query = query.eq('clinic_id', clinicId);
      }

      if (patientId) {
        query = query.eq('patient_id', patientId);
      }

      const { data, error } = await query.order('last_name');

      if (error) {
        console.error('Error fetching active episodes:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Map view fields to Episode interface
      const episodes = (data || []).map((row: Record<string, unknown>) => ({
        id: row.episode_id,
        patient_id: row.patient_id,
        clinic_id: row.clinic_id,
        start_date: row.start_date,
        diagnosis: row.diagnosis,
        frequency: row.frequency,
        primary_pt_id: row.primary_pt_id,
        care_team_ids: row.care_team_ids,
        status: 'active',
        // Joined patient fields
        first_name: row.first_name,
        last_name: row.last_name,
        date_of_birth: row.date_of_birth,
        primary_diagnosis: row.primary_diagnosis,
        referring_physician: row.referring_physician,
      }));

      return NextResponse.json(episodes);
    }

    // For other queries, use episodes table with join
    let query = client
      .from('episodes')
      .select(`
        *,
        patient:patients(first_name, last_name, date_of_birth, primary_diagnosis, referring_physician)
      `);

    if (clinicId) {
      query = query.eq('clinic_id', clinicId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (patientId) {
      query = query.eq('patient_id', patientId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching episodes:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Flatten patient data - handle both array and object responses from Supabase
    const episodes = (data || []).map((row: Record<string, unknown>) => {
      const patientData = row.patient as Record<string, unknown> | Record<string, unknown>[] | null;
      const patient = Array.isArray(patientData) ? patientData[0] : patientData;
      return {
        ...row,
        first_name: patient?.first_name,
        last_name: patient?.last_name,
        date_of_birth: patient?.date_of_birth,
        primary_diagnosis: patient?.primary_diagnosis,
        referring_physician: patient?.referring_physician,
        patient: undefined,
      };
    });

    return NextResponse.json(episodes);
  } catch (error) {
    console.error('Error in GET /api/episodes:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const body = await request.json();
    const {
      patient_id,
      clinic_id,
      start_date,
      diagnosis,
      diagnosis_codes,
      primary_diagnosis_codes,
      treatment_diagnosis_codes,
      frequency,
      duration,
      primary_pt_id,
      care_team_ids,
    } = body;

    if (!patient_id || !clinic_id) {
      return NextResponse.json(
        { error: 'patient_id and clinic_id are required' },
        { status: 400 }
      );
    }

    const { data, error } = await client
      .from('episodes')
      .insert({
        patient_id,
        clinic_id,
        start_date: start_date || new Date().toISOString().split('T')[0],
        diagnosis,
        diagnosis_codes,
        primary_diagnosis_codes: primary_diagnosis_codes || [],
        treatment_diagnosis_codes: treatment_diagnosis_codes || [],
        frequency,
        duration,
        primary_pt_id,
        care_team_ids: care_team_ids || [],
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating episode:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/episodes:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
