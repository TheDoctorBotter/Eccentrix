/**
 * HEP Program Exercises API
 * POST:   Add exercise to HEP program
 * DELETE:  Remove exercise from HEP program (via query param exercise_id)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const body = await request.json();
    const hepProgramId = params.id;

    const {
      exercise_id,
      sort_order,
      sets,
      reps,
      hold,
      frequency,
      special_instructions,
    } = body;

    if (!exercise_id) {
      return NextResponse.json(
        { error: 'exercise_id is required' },
        { status: 400 }
      );
    }

    const { data, error } = await client
      .from('hep_program_exercises')
      .insert({
        hep_program_id: hepProgramId,
        exercise_id,
        sort_order: sort_order ?? 0,
        sets: sets || null,
        reps: reps || null,
        hold: hold || null,
        frequency: frequency || null,
        special_instructions: special_instructions || null,
        is_active: true,
        date_added: new Date().toISOString().split('T')[0],
      })
      .select('*, exercise:exercise_library(*)')
      .single();

    if (error) {
      console.error('Error adding exercise to HEP program:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/hep/[id]/exercises:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const { searchParams } = new URL(request.url);
    const exerciseId = searchParams.get('exercise_id');
    const hepProgramId = params.id;

    if (!exerciseId) {
      return NextResponse.json(
        { error: 'exercise_id query parameter is required' },
        { status: 400 }
      );
    }

    const { error } = await client
      .from('hep_program_exercises')
      .delete()
      .eq('hep_program_id', hepProgramId)
      .eq('exercise_id', exerciseId);

    if (error) {
      console.error('Error removing exercise from HEP program:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/hep/[id]/exercises:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
