/**
 * POST /api/bcbs/restore
 * Restore 1 BCBS visit when a completed visit is undone.
 *
 * Body: { benefit_id, visit_id, discipline, restored_by, note? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';
import { restoreBCBSVisit } from '@/lib/bcbs/visitTracker';
import type { Discipline } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const { benefit_id, visit_id, discipline, restored_by, note } = await request.json();

    if (!benefit_id || !visit_id || !discipline) {
      return NextResponse.json(
        { error: 'benefit_id, visit_id, and discipline are required' },
        { status: 400 },
      );
    }

    const result = await restoreBCBSVisit(
      client,
      benefit_id,
      visit_id,
      discipline as Discipline,
      restored_by || null,
      note || 'Visit completion undone',
    );

    if (!result.success) {
      return NextResponse.json({ error: result.warning }, { status: 500 });
    }

    return NextResponse.json({ success: true, warning: result.warning });
  } catch (error) {
    console.error('Error in POST /api/bcbs/restore:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
