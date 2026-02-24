/**
 * HEP Programs API
 * GET:  List HEP programs (filter by patient_id, episode_id, status)
 * POST: Create HEP program with exercises
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
    const patientId = searchParams.get('patient_id');
    const episodeId = searchParams.get('episode_id');
    const status = searchParams.get('status');

    if (!clinicId) {
      return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });
    }

    let query = client
      .from('hep_programs')
      .select('*, hep_program_exercises(*, exercise:exercise_library(*))')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false });

    if (patientId) {
      query = query.eq('patient_id', patientId);
    }

    if (episodeId) {
      query = query.eq('episode_id', episodeId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching HEP programs:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Error in GET /api/hep:', error);
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
      episode_id,
      clinic_id,
      name,
      status,
      start_date,
      instructions,
      frequency,
      assigned_by,
      exercises,
    } = body;

    if (!patient_id || !episode_id || !clinic_id || !name) {
      return NextResponse.json(
        { error: 'patient_id, episode_id, clinic_id, and name are required' },
        { status: 400 }
      );
    }

    // Create the HEP program
    const { data: program, error: programError } = await client
      .from('hep_programs')
      .insert({
        patient_id,
        episode_id,
        clinic_id,
        name,
        status: status || 'active',
        start_date: start_date || new Date().toISOString().split('T')[0],
        instructions: instructions || null,
        frequency: frequency || null,
        assigned_by: assigned_by || null,
      })
      .select()
      .single();

    if (programError) {
      console.error('Error creating HEP program:', programError);
      return NextResponse.json({ error: programError.message }, { status: 500 });
    }

    // Add exercises if provided
    if (exercises && exercises.length > 0) {
      const exerciseRows = exercises.map((ex: {
        exercise_id: string;
        sort_order?: number;
        sets?: string;
        reps?: string;
        hold?: string;
        frequency?: string;
        special_instructions?: string;
      }, index: number) => ({
        hep_program_id: program.id,
        exercise_id: ex.exercise_id,
        sort_order: ex.sort_order ?? index,
        sets: ex.sets || null,
        reps: ex.reps || null,
        hold: ex.hold || null,
        frequency: ex.frequency || null,
        special_instructions: ex.special_instructions || null,
        is_active: true,
        date_added: new Date().toISOString().split('T')[0],
      }));

      const { error: exerciseError } = await client
        .from('hep_program_exercises')
        .insert(exerciseRows);

      if (exerciseError) {
        console.error('Error adding exercises to HEP program:', exerciseError);
        // Program was created but exercises failed
        return NextResponse.json(
          { ...program, exercise_error: exerciseError.message },
          { status: 201 }
        );
      }
    }

    // Re-fetch with exercises
    const { data: fullProgram, error: fetchError } = await client
      .from('hep_programs')
      .select('*, hep_program_exercises(*, exercise:exercise_library(*))')
      .eq('id', program.id)
      .single();

    if (fetchError) {
      return NextResponse.json(program, { status: 201 });
    }

    return NextResponse.json(fullProgram, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/hep:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
