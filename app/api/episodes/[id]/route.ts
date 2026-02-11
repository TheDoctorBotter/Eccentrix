/**
 * Single Episode API
 * GET: Get episode details with patient info
 * PATCH: Update episode
 * DELETE: Delete episode (soft delete by setting status to discharged)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const { data, error } = await client
      .from('episodes')
      .select(`
        *,
        patient:patients(first_name, last_name, date_of_birth, gender, phone, email, address, primary_diagnosis, secondary_diagnoses, referring_physician, insurance_id, allergies, precautions)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
      }
      console.error('Error fetching episode:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Flatten patient data - handle both array and object responses from Supabase
    const patientData = data.patient as Record<string, unknown> | Record<string, unknown>[] | null;
    const patient = Array.isArray(patientData) ? patientData[0] : patientData;
    const episode = {
      ...data,
      first_name: patient?.first_name,
      last_name: patient?.last_name,
      date_of_birth: patient?.date_of_birth,
      gender: patient?.gender,
      phone: patient?.phone,
      email: patient?.email,
      address: patient?.address,
      primary_diagnosis: patient?.primary_diagnosis,
      secondary_diagnoses: patient?.secondary_diagnoses,
      referring_physician: patient?.referring_physician,
      insurance_id: patient?.insurance_id,
      allergies: patient?.allergies,
      precautions: patient?.precautions,
      patient: undefined,
    };

    return NextResponse.json(episode);
  } catch (error) {
    console.error('Error in GET /api/episodes/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const body = await request.json();
    const allowedFields = [
      'diagnosis',
      'diagnosis_codes',
      'frequency',
      'duration',
      'primary_pt_id',
      'care_team_ids',
      'status',
      'end_date',
      'discharged_at',
      'discharged_by',
      'discharge_reason',
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data, error } = await client
      .from('episodes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
      }
      console.error('Error updating episode:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in PATCH /api/episodes/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    // Soft delete by setting status to discharged
    const { data, error } = await client
      .from('episodes')
      .update({
        status: 'discharged',
        discharged_at: new Date().toISOString(),
        discharge_reason: 'Episode closed',
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
      }
      console.error('Error deleting episode:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in DELETE /api/episodes/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
