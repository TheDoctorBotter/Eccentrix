/**
 * Exercises API – Exercise Library
 * GET:  List exercises (filterable by category, body_region, difficulty, clinic_id, search)
 * POST: Create exercise (admin/PT only)
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
    const category = searchParams.get('category');
    const bodyRegion = searchParams.get('body_region');
    const difficulty = searchParams.get('difficulty');
    const search = searchParams.get('search');

    let query = client
      .from('exercise_library')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (clinicId) {
      query = query.or(`clinic_id.eq.${clinicId},clinic_id.is.null`);
    }

    if (category) {
      query = query.eq('category', category);
    }

    if (bodyRegion) {
      query = query.eq('body_region', bodyRegion);
    }

    if (difficulty) {
      query = query.eq('difficulty', difficulty);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching exercises:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Error in GET /api/exercises:', error);
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
      name,
      description,
      category,
      body_region,
      difficulty,
      equipment,
      default_sets,
      default_reps,
      default_hold,
      default_frequency,
      instructions,
      precautions,
      progression_notes,
      image_url,
      video_url,
      thumbnail_url,
    } = body;

    if (!name || !category) {
      return NextResponse.json(
        { error: 'name and category are required' },
        { status: 400 }
      );
    }

    const { data, error } = await client
      .from('exercise_library')
      .insert({
        clinic_id: clinic_id || null,
        name,
        description: description || null,
        category,
        body_region: body_region || null,
        difficulty: difficulty || 'moderate',
        equipment: equipment || null,
        default_sets: default_sets || null,
        default_reps: default_reps || null,
        default_hold: default_hold || null,
        default_frequency: default_frequency || null,
        instructions: instructions || null,
        precautions: precautions || null,
        progression_notes: progression_notes || null,
        image_url: image_url || null,
        video_url: video_url || null,
        thumbnail_url: thumbnail_url || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating exercise:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/exercises:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
