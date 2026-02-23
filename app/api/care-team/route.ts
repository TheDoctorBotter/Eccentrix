/**
 * Care Team API
 * GET:  List care team members for an episode
 * POST: Add a member to the care team
 * DELETE: Remove a member from the care team (via body: { episode_id, user_id })
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

    if (!episodeId) {
      return NextResponse.json({ error: 'episode_id is required' }, { status: 400 });
    }

    const { data, error } = await client
      .from('episode_care_team')
      .select('*')
      .eq('episode_id', episodeId)
      .order('assigned_at', { ascending: true });

    if (error) {
      console.error('Error fetching care team:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Error in GET /api/care-team:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const body = await request.json();
    const { episode_id, user_id, role } = body;

    if (!episode_id || !user_id || !role) {
      return NextResponse.json(
        { error: 'episode_id, user_id, and role are required' },
        { status: 400 }
      );
    }

    const { data, error } = await client
      .from('episode_care_team')
      .upsert(
        { episode_id, user_id, role, assigned_at: new Date().toISOString() },
        { onConflict: 'episode_id,user_id' }
      )
      .select()
      .single();

    if (error) {
      console.error('Error adding care team member:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Also update the episodes.care_team_ids array and primary_pt_id
    const { data: allMembers } = await client
      .from('episode_care_team')
      .select('user_id, role')
      .eq('episode_id', episode_id);

    if (allMembers) {
      const careTeamIds = allMembers.map((m: { user_id: string }) => m.user_id);
      const primaryPt = allMembers.find((m: { role: string }) => m.role === 'pt');

      await client
        .from('episodes')
        .update({
          care_team_ids: careTeamIds,
          ...(primaryPt ? { primary_pt_id: primaryPt.user_id } : {}),
        })
        .eq('id', episode_id);
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/care-team:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const body = await request.json();
    const { episode_id, user_id } = body;

    if (!episode_id || !user_id) {
      return NextResponse.json(
        { error: 'episode_id and user_id are required' },
        { status: 400 }
      );
    }

    const { error } = await client
      .from('episode_care_team')
      .delete()
      .eq('episode_id', episode_id)
      .eq('user_id', user_id);

    if (error) {
      console.error('Error removing care team member:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Update episodes.care_team_ids
    const { data: allMembers } = await client
      .from('episode_care_team')
      .select('user_id, role')
      .eq('episode_id', episode_id);

    const careTeamIds = (allMembers || []).map((m: { user_id: string }) => m.user_id);
    const primaryPt = (allMembers || []).find((m: { role: string }) => m.role === 'pt');

    await client
      .from('episodes')
      .update({
        care_team_ids: careTeamIds,
        primary_pt_id: primaryPt ? primaryPt.user_id : null,
      })
      .eq('id', episode_id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/care-team:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
