/**
 * PTBot → Eccentrix EMR Exercise Sync Endpoint
 *
 * Receives exercise data (including video URLs) from PTBot and upserts
 * them into the exercise_library table.
 *
 * POST /api/ptbot/exercises
 * Authorization: Bearer <PTBOT_API_KEY>
 *
 * Body (single or array):
 *   { name, category, description?, body_region?, difficulty?, equipment?,
 *     default_sets?, default_reps?, default_hold?, default_frequency?,
 *     instructions?, precautions?, progression_notes?,
 *     video_url?, thumbnail_url?, image_url? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

function verifyPTBotAuth(request: NextRequest): boolean {
  const apiKey = process.env.PTBOT_API_KEY;
  if (!apiKey) {
    console.warn('[ptbot/exercises] PTBOT_API_KEY not configured');
    return false;
  }
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  return token === apiKey;
}

export async function POST(request: NextRequest) {
  if (!verifyPTBotAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const clinicId = process.env.PTBOT_DEFAULT_CLINIC_ID;
    if (!clinicId) {
      return NextResponse.json(
        { error: 'PTBOT_DEFAULT_CLINIC_ID not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const exercisesInput = Array.isArray(body) ? body : [body];

    const results: Array<{ name: string; id?: string; error?: string }> = [];

    for (const ex of exercisesInput) {
      if (!ex.name || !ex.category) {
        results.push({ name: ex.name || 'unknown', error: 'name and category are required' });
        continue;
      }

      // Upsert by name + clinic_id to avoid duplicates
      const { data: existing } = await supabaseAdmin
        .from('exercise_library')
        .select('id')
        .eq('name', ex.name)
        .eq('clinic_id', clinicId)
        .limit(1);

      if (existing && existing.length > 0) {
        // Update existing exercise with new video data
        const { data, error } = await supabaseAdmin
          .from('exercise_library')
          .update({
            description: ex.description ?? undefined,
            category: ex.category,
            body_region: ex.body_region ?? undefined,
            difficulty: ex.difficulty ?? undefined,
            equipment: ex.equipment ?? undefined,
            default_sets: ex.default_sets ?? undefined,
            default_reps: ex.default_reps ?? undefined,
            default_hold: ex.default_hold ?? undefined,
            default_frequency: ex.default_frequency ?? undefined,
            instructions: ex.instructions ?? undefined,
            precautions: ex.precautions ?? undefined,
            progression_notes: ex.progression_notes ?? undefined,
            video_url: ex.video_url ?? undefined,
            thumbnail_url: ex.thumbnail_url ?? undefined,
            image_url: ex.image_url ?? undefined,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing[0].id)
          .select('id')
          .single();

        if (error) {
          results.push({ name: ex.name, error: error.message });
        } else {
          results.push({ name: ex.name, id: data?.id });
        }
      } else {
        // Insert new exercise
        const { data, error } = await supabaseAdmin
          .from('exercise_library')
          .insert({
            clinic_id: clinicId,
            name: ex.name,
            description: ex.description || null,
            category: ex.category,
            body_region: ex.body_region || null,
            difficulty: ex.difficulty || 'moderate',
            equipment: ex.equipment || null,
            default_sets: ex.default_sets || null,
            default_reps: ex.default_reps || null,
            default_hold: ex.default_hold || null,
            default_frequency: ex.default_frequency || null,
            instructions: ex.instructions || null,
            precautions: ex.precautions || null,
            progression_notes: ex.progression_notes || null,
            video_url: ex.video_url || null,
            thumbnail_url: ex.thumbnail_url || null,
            image_url: ex.image_url || null,
            is_active: true,
          })
          .select('id')
          .single();

        if (error) {
          results.push({ name: ex.name, error: error.message });
        } else {
          results.push({ name: ex.name, id: data?.id });
        }
      }
    }

    const failed = results.filter((r) => r.error);
    return NextResponse.json(
      {
        synced: results.length - failed.length,
        failed: failed.length,
        results,
      },
      { status: failed.length === results.length ? 500 : 201 }
    );
  } catch (error) {
    console.error('[ptbot/exercises] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
