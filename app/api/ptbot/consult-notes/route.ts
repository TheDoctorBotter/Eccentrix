/**
 * PTBot → Buckeye EMR SOAP Note Sync Endpoint
 *
 * Receives telehealth SOAP notes from PTBot and creates clinical notes
 * in Buckeye EMR, linked to the appropriate patient record.
 *
 * Required environment variables:
 *   PTBOT_API_KEY          - Shared secret matching PTBot's EMR_API_KEY Supabase secret
 *   PTBOT_DEFAULT_CLINIC_ID - UUID of the Buckeye Physical Therapy clinic in this EMR
 *
 * Usage:
 *   POST /api/ptbot/consult-notes
 *   Authorization: Bearer <PTBOT_API_KEY>
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

function verifyPTBotAuth(request: NextRequest): boolean {
  const apiKey = process.env.PTBOT_API_KEY;
  if (!apiKey) {
    console.warn('[ptbot/consult-notes] PTBOT_API_KEY not configured');
    return false;
  }
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  return token === apiKey;
}

/** Find or create patient in AIDOCS by email within the given clinic */
async function findOrCreatePatient(
  clinicId: string,
  patientName: string,
  patientEmail: string | null,
  patientPhone: string | null
): Promise<string> {
  if (patientEmail) {
    const { data: existing } = await supabaseAdmin
      .from('patients')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('email', patientEmail)
      .maybeSingle();

    if (existing?.id) return existing.id;
  }

  const nameParts = patientName.trim().split(' ');
  const firstName = nameParts[0] || patientName;
  const lastName = nameParts.slice(1).join(' ') || '';

  const { data, error } = await supabaseAdmin
    .from('patients')
    .insert({
      clinic_id: clinicId,
      first_name: firstName,
      last_name: lastName,
      email: patientEmail ?? null,
      phone: patientPhone ?? null,
      is_active: true,
      primary_diagnosis: 'Telehealth consult via PTBot',
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create patient: ${error.message}`);
  }

  return data.id;
}

/** Format PTBot SOAP data into a readable clinical note */
function formatSOAPNote(body: Record<string, unknown>): string {
  const soap = body.soap as Record<string, string> | undefined;
  const recommendations = body.recommendations as string | undefined;
  const session = body.session as Record<string, unknown> | undefined;
  const flags = body.flags as Record<string, boolean> | undefined;
  const compliance = body.compliance as Record<string, unknown> | undefined;

  const lines: string[] = [];

  lines.push('=== TELEHEALTH CONSULTATION NOTE ===');
  lines.push('Source: PTBot Telehealth');
  if (session?.date) {
    lines.push(`Date of Service: ${new Date(session.date as string).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })}`);
  }
  if (session?.duration_minutes) {
    lines.push(`Session Duration: ${session.duration_minutes} minutes`);
  }
  lines.push('');

  if (soap?.subjective) { lines.push('SUBJECTIVE:'); lines.push(soap.subjective); lines.push(''); }
  if (soap?.objective)  { lines.push('OBJECTIVE:');  lines.push(soap.objective);  lines.push(''); }
  if (soap?.assessment) { lines.push('ASSESSMENT:'); lines.push(soap.assessment); lines.push(''); }
  if (soap?.plan)       { lines.push('PLAN:');        lines.push(soap.plan);       lines.push(''); }

  if (recommendations) {
    lines.push('RECOMMENDATIONS:');
    lines.push(recommendations);
    lines.push('');
  }

  if (flags) {
    lines.push('CLINICAL FLAGS:');
    lines.push(`  Red Flags: ${flags.red_flags ? 'YES - See note' : 'None identified'}`);
    lines.push(`  Follow-up Recommended: ${flags.follow_up_recommended ? 'Yes' : 'No'}`);
    lines.push(`  In-Person Referral: ${flags.in_person_referral ? 'Yes' : 'No'}`);
    lines.push('');
  }

  if (compliance) {
    lines.push('COMPLIANCE:');
    if (compliance.location_state) lines.push(`  Patient Location (verified): ${compliance.location_state}`);
    if (compliance.consent_version) lines.push(`  Telehealth Consent Version: ${compliance.consent_version}`);
    if (compliance.location_verified) lines.push('  Location Verified: Yes');
  }

  return lines.join('\n');
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
    const { external_id, patient_name, patient_email, patient_phone, note_type, session } = body as {
      external_id?: string;
      patient_name: string;
      patient_email?: string;
      patient_phone?: string;
      note_type?: string;
      session?: { date?: string; duration_minutes?: number };
    };

    if (!patient_name) {
      return NextResponse.json({ success: false, error: 'patient_name is required' }, { status: 400 });
    }

    const patientId = await findOrCreatePatient(clinicId, patient_name, patient_email ?? null, patient_phone ?? null);
    const outputText = formatSOAPNote(body as Record<string, unknown>);

    const docType = note_type === 'follow_up' ? 'daily_note'
      : note_type === 'initial_evaluation' ? 'evaluation'
      : note_type === 'progress_note' ? 'progress_summary'
      : 'daily_note';

    let existingNoteId: string | null = null;
    if (external_id) {
      const { data: existingNote } = await supabaseAdmin
        .from('notes')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('patient_id', patientId)
        .contains('input_data', { ptbot_external_id: external_id })
        .maybeSingle();
      existingNoteId = existingNote?.id ?? null;
    }

    const serviceDate = session?.date
      ? new Date(session.date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const noteTitle = `PTBot Telehealth – ${patient_name} – ${new Date(serviceDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    if (existingNoteId) {
      const { data, error } = await supabaseAdmin
        .from('notes')
        .update({
          output_text: outputText,
          input_data: { ...(body as Record<string, unknown>), ptbot_external_id: external_id },
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingNoteId)
        .select('id')
        .single();

      if (error) {
        console.error('[ptbot/consult-notes] Update error:', error.message);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, record_id: data.id });
    }

    const { data, error } = await supabaseAdmin
      .from('notes')
      .insert({
        patient_id: patientId,
        clinic_id: clinicId,
        note_type: docType,
        title: noteTitle,
        date_of_service: serviceDate,
        output_text: outputText,
        input_data: { ...(body as Record<string, unknown>), ptbot_external_id: external_id },
        status: 'draft',
      })
      .select('id')
      .single();

    if (error) {
      console.error('[ptbot/consult-notes] Insert error:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    console.log('[ptbot/consult-notes] Note synced from PTBot', {
      ptbot_external_id: external_id,
      aidocs_note_id: data.id,
      patient_id: patientId,
    });

    return NextResponse.json({ success: true, record_id: data.id }, { status: 201 });
  } catch (err) {
    console.error('[ptbot/consult-notes] Unexpected error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
