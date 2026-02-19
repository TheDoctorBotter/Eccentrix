/**
 * PTBot → Buckeye EMR Patient Sync Endpoint
 *
 * Receives patient records from PTBot and upserts them into Buckeye EMR.
 * Authenticates via a shared bearer token (PTBOT_API_KEY env var).
 *
 * Required environment variables:
 *   PTBOT_API_KEY          - Shared secret matching PTBot's EMR_API_KEY Supabase secret
 *   PTBOT_DEFAULT_CLINIC_ID - UUID of the Buckeye Physical Therapy clinic in this EMR
 *
 * Usage:
 *   POST /api/ptbot/patients
 *   Authorization: Bearer <PTBOT_API_KEY>
 *   { external_id, first_name, last_name, email, phone, date_of_birth, source }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

function verifyPTBotAuth(request: NextRequest): boolean {
  const apiKey = process.env.PTBOT_API_KEY;
  if (!apiKey) {
    console.warn('[ptbot/patients] PTBOT_API_KEY not configured');
    return false;
  }
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  return token === apiKey;
}

export async function POST(request: NextRequest) {
  if (!verifyPTBotAuth(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const clinicId = process.env.PTBOT_DEFAULT_CLINIC_ID;
  if (!clinicId) {
    return NextResponse.json(
      { success: false, error: 'PTBOT_DEFAULT_CLINIC_ID not configured on Buckeye EMR server' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { first_name, last_name, email, phone, date_of_birth, external_id } = body;

    if (!first_name || !last_name) {
      return NextResponse.json(
        { success: false, error: 'first_name and last_name are required' },
        { status: 400 }
      );
    }

    let existingId: string | null = null;
    if (email) {
      const { data: existing } = await supabaseAdmin
        .from('patients')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('email', email)
        .maybeSingle();
      existingId = existing?.id ?? null;
    }

    if (existingId) {
      const { data, error } = await supabaseAdmin
        .from('patients')
        .update({
          first_name,
          last_name,
          phone: phone ?? undefined,
          date_of_birth: date_of_birth ?? undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingId)
        .select('id')
        .single();

      if (error) {
        console.error('[ptbot/patients] Update error:', error.message);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, record_id: data.id });
    }

    const { data, error } = await supabaseAdmin
      .from('patients')
      .insert({
        clinic_id: clinicId,
        first_name,
        last_name,
        email: email ?? null,
        phone: phone ?? null,
        date_of_birth: date_of_birth ?? null,
        is_active: true,
        primary_diagnosis: 'Telehealth consult via PTBot',
      })
      .select('id')
      .single();

    if (error) {
      console.error('[ptbot/patients] Insert error:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    console.log('[ptbot/patients] Patient synced from PTBot', {
      ptbot_external_id: external_id,
      aidocs_id: data.id,
    });

    return NextResponse.json({ success: true, record_id: data.id }, { status: 201 });
  } catch (err) {
    console.error('[ptbot/patients] Unexpected error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
