/**
 * Patients API
 * GET: List patients for a clinic
 * POST: Create a new patient
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
    const activeOnly = searchParams.get('active') !== 'false';
    const search = searchParams.get('search');

    let query = client.from('patients').select('*');

    if (clinicId) {
      query = query.eq('clinic_id', clinicId);
    }

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
    }

    const { data, error } = await query.order('last_name').order('first_name');

    if (error) {
      console.error('Error fetching patients:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Error in GET /api/patients:', error);
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
      first_name,
      last_name,
      date_of_birth,
      gender,
      phone,
      email,
      address,
      primary_diagnosis,
      secondary_diagnoses,
      referring_physician,
      insurance_id,
      allergies,
      precautions,
    } = body;

    if (!clinic_id || !first_name || !last_name) {
      return NextResponse.json(
        { error: 'clinic_id, first_name, and last_name are required' },
        { status: 400 }
      );
    }

    const { data, error } = await client
      .from('patients')
      .insert({
        clinic_id,
        first_name,
        last_name,
        date_of_birth,
        gender,
        phone,
        email,
        address,
        primary_diagnosis,
        secondary_diagnoses,
        referring_physician,
        insurance_id,
        allergies,
        precautions,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating patient:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/patients:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
