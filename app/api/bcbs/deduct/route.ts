/**
 * POST /api/bcbs/deduct
 * Deduct 1 BCBS visit when a visit is completed.
 *
 * Body: { benefit_id, visit_id, discipline, patient_id, clinic_id, therapist_id?, date_of_service, created_by }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';
import { deductBCBSVisit } from '@/lib/bcbs/visitTracker';
import type { Discipline } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const {
      benefit_id,
      visit_id,
      discipline,
      patient_id,
      clinic_id,
      therapist_id,
      date_of_service,
      created_by,
    } = await request.json();

    if (!benefit_id || !visit_id || !discipline || !patient_id || !clinic_id) {
      return NextResponse.json(
        { error: 'benefit_id, visit_id, discipline, patient_id, and clinic_id are required' },
        { status: 400 },
      );
    }

    const result = await deductBCBSVisit(
      client,
      benefit_id,
      visit_id,
      discipline as Discipline,
      patient_id,
      clinic_id,
      therapist_id || null,
      date_of_service || new Date().toISOString().split('T')[0],
      created_by || null,
    );

    if (!result.success) {
      return NextResponse.json({ error: result.warning }, { status: 500 });
    }

    return NextResponse.json({ success: true, warning: result.warning });
  } catch (error) {
    console.error('Error in POST /api/bcbs/deduct:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
