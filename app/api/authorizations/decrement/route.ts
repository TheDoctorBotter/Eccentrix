/**
 * Decrement authorization visits when a visit is completed.
 * POST: { auth_id, visit_id }
 * Guards against double-decrement by checking if the visit already has this auth_id.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const { auth_id, visit_id } = await request.json();

    if (!auth_id || !visit_id) {
      return NextResponse.json(
        { error: 'auth_id and visit_id are required' },
        { status: 400 }
      );
    }

    // Check if this visit already has this auth_id (double-decrement guard)
    const { data: visit } = await client
      .from('visits')
      .select('id, auth_id')
      .eq('id', visit_id)
      .single();

    if (visit?.auth_id === auth_id) {
      return NextResponse.json({ message: 'Already decremented', skipped: true });
    }

    // Link the visit to the auth
    const { error: visitError } = await client
      .from('visits')
      .update({ auth_id })
      .eq('id', visit_id);

    if (visitError) {
      console.error('Error linking visit to auth:', visitError);
      return NextResponse.json({ error: visitError.message }, { status: 500 });
    }

    // Fetch current auth
    const { data: auth, error: authError } = await client
      .from('prior_authorizations')
      .select('id, used_visits, authorized_visits, auth_type, units_used, units_authorized')
      .eq('id', auth_id)
      .single();

    if (authError || !auth) {
      console.error('Error fetching auth:', authError);
      return NextResponse.json({ error: 'Authorization not found' }, { status: 404 });
    }

    // Increment used_visits (or units_used)
    const updateData: Record<string, unknown> = {};
    if (auth.auth_type === 'units') {
      updateData.units_used = (auth.units_used || 0) + 1;
    } else {
      updateData.used_visits = (auth.used_visits || 0) + 1;
    }

    // Auto-set status to exhausted if all visits/units used
    if (auth.auth_type === 'units') {
      if (auth.units_authorized && updateData.units_used as number >= auth.units_authorized) {
        updateData.status = 'exhausted';
      }
    } else {
      if (auth.authorized_visits && updateData.used_visits as number >= auth.authorized_visits) {
        updateData.status = 'exhausted';
      }
    }

    const { data: updated, error: updateError } = await client
      .from('prior_authorizations')
      .update(updateData)
      .eq('id', auth_id)
      .select()
      .single();

    if (updateError) {
      console.error('Error decrementing auth:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, authorization: updated });
  } catch (error) {
    console.error('Error in POST /api/authorizations/decrement:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
