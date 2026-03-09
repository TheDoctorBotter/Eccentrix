/**
 * Reverse authorization usage when a visit is un-completed (reverted).
 * POST: { visit_id }
 *
 * Restores the deducted units/visits to the authorization and clears
 * the auth_usage_applied flag on the visit.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';
import { reverseAuthorizationUsage } from '@/lib/authorizations';

export async function POST(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const { visit_id } = await request.json();

    if (!visit_id) {
      return NextResponse.json(
        { error: 'visit_id is required' },
        { status: 400 }
      );
    }

    const result = await reverseAuthorizationUsage(client, visit_id);

    if (!result.success) {
      console.error('Auth reversal failed:', result.warning);
      return NextResponse.json({ error: result.warning }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      warning: result.warning,
    });
  } catch (error) {
    console.error('Error in POST /api/authorizations/reverse:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
