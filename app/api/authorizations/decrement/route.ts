/**
 * Decrement authorization visits/units when a visit is completed.
 * POST: { auth_id, visit_id, units_used?, discipline? }
 *
 * Uses the shared applyAuthorizationUsage() utility for idempotency
 * (auth_usage_applied flag) and proper unit-based vs visit-based deduction.
 *
 * Backwards-compatible: if units_used is not provided, falls back to +1.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';
import { applyAuthorizationUsage } from '@/lib/authorizations';

export async function POST(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const { auth_id, visit_id, units_used, discipline } = await request.json();

    if (!auth_id || !visit_id) {
      return NextResponse.json(
        { error: 'auth_id and visit_id are required' },
        { status: 400 }
      );
    }

    // Resolve discipline from the visit if not provided
    let visitDiscipline = discipline;
    if (!visitDiscipline) {
      const { data: visitData } = await client
        .from('visits')
        .select('discipline')
        .eq('id', visit_id)
        .single();
      visitDiscipline = visitData?.discipline ?? 'PT';
    }

    // Use the shared utility which handles idempotency, unit vs visit deduction,
    // clamping, and exhausted status
    const result = await applyAuthorizationUsage(
      client,
      visit_id,
      auth_id,
      visitDiscipline,
      units_used ?? 1,
    );

    if (!result.success) {
      console.error('Auth deduction failed:', result.warning);
      return NextResponse.json({ error: result.warning }, { status: 500 });
    }

    if (result.warning) {
      console.warn('Auth deduction warning:', result.warning);
    }

    // Fetch updated authorization for response
    const { data: updated } = await client
      .from('prior_authorizations')
      .select('*')
      .eq('id', auth_id)
      .single();

    return NextResponse.json({
      success: true,
      skipped: result.warning === 'Auth usage already applied',
      authorization: updated,
      warning: result.warning,
    });
  } catch (error) {
    console.error('Error in POST /api/authorizations/decrement:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
