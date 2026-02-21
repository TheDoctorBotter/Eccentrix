/**
 * PTBot Consult Notes API
 * POST: Receive SOAP notes from PTBot and store in the notes table
 *
 * Flow:
 * 1. Authenticate via Bearer token (PTBOT_API_KEY)
 * 2. Look up or auto-create patient by email
 * 3. Insert note into the `notes` table (the table the app reads from)
 * 4. Idempotent: if a note with the same ptbot_external_id exists, update it
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { NoteInputData } from '@/lib/types';

interface PTBotNotePayload {
  external_id: string;
  appointment_external_id?: string;
  patient_external_id?: string;
  patient_name: string;
  patient_email?: string | null;
  note_type?: string;
  soap: {
    subjective?: string | null;
    objective?: string | null;
    assessment?: string | null;
    plan?: string | null;
  };
  recommendations?: string | null;
  flags?: {
    red_flags?: boolean;
    follow_up_recommended?: boolean;
    in_person_referral?: boolean;
  };
  session?: {
    duration_minutes?: number | null;
    date?: string | null;
    clinician_id?: string | null;
    delivery_method?: string | null;
  };
  compliance?: {
    location_verified?: boolean;
    location_state?: string;
    consent_version?: string;
  };
  source?: string;
  synced_at?: string;
}

function parsePatientName(fullName: string): { firstName: string; lastName: string } {
  if (!fullName || typeof fullName !== 'string') {
    return { firstName: 'Unknown', lastName: 'Patient' };
  }

  const trimmed = fullName.trim();

  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map((p) => p.trim());
    return {
      lastName: parts[0] || 'Patient',
      firstName: parts[1] || 'Unknown',
    };
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: 'Unknown' };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

function buildOutputText(
  soap: PTBotNotePayload['soap'],
  recommendations?: string | null,
  flags?: PTBotNotePayload['flags'],
  session?: PTBotNotePayload['session'],
  compliance?: PTBotNotePayload['compliance']
): string {
  const lines: string[] = [];

  lines.push('=== TELEHEALTH CONSULTATION NOTE ===');
  lines.push('Source: PTBot Telehealth');
  if (session?.date) {
    lines.push(`Date of Service: ${new Date(session.date).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })}`);
  }
  if (session?.duration_minutes) {
    lines.push(`Session Duration: ${session.duration_minutes} minutes`);
  }
  lines.push('');

  lines.push('SUBJECTIVE:');
  lines.push(soap.subjective || 'Not provided.');
  lines.push('');

  lines.push('OBJECTIVE:');
  lines.push(soap.objective || 'Not provided.');
  lines.push('');

  lines.push('ASSESSMENT:');
  lines.push(soap.assessment || 'Not provided.');
  lines.push('');

  lines.push('PLAN:');
  lines.push(soap.plan || 'Not provided.');
  lines.push('');

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
    if (compliance.location_state) {
      lines.push(`  Patient Location (verified): ${compliance.location_state}`);
    }
    if (compliance.consent_version) {
      lines.push(`  Telehealth Consent Version: ${compliance.consent_version}`);
    }
    if (compliance.location_verified) {
      lines.push('  Location Verified: Yes');
    }
  }

  return lines.join('\n');
}

async function findOrCreatePatient(
  clinicId: string,
  firstName: string,
  lastName: string,
  email: string | null
): Promise<string> {
  if (email) {
    const { data: existing } = await supabaseAdmin
      .from('patients')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('email', email)
      .maybeSingle();

    if (existing?.id) return existing.id;
  }

  const { data, error } = await supabaseAdmin
    .from('patients')
    .insert({
      clinic_id: clinicId,
      first_name: firstName,
      last_name: lastName,
      email: email ?? null,
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

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const expectedKey = process.env.PTBOT_API_KEY;

    if (!expectedKey) {
      console.error('[ptbot/consult-notes] PTBOT_API_KEY not configured');
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    if (!token || token !== expectedKey) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const clinicId = process.env.PTBOT_DEFAULT_CLINIC_ID;
    if (!clinicId) {
      return NextResponse.json(
        { success: false, error: 'PTBOT_DEFAULT_CLINIC_ID not configured' },
        { status: 503 }
      );
    }

    // 2. Parse and validate payload
    const body: PTBotNotePayload = await request.json();

    if (!body.external_id || !body.patient_name || !body.soap) {
      return NextResponse.json(
        { success: false, error: 'external_id, patient_name, and soap are required' },
        { status: 400 }
      );
    }

    const { firstName, lastName } = parsePatientName(body.patient_name);
    const dateOfService = body.session?.date
      ? new Date(body.session.date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    // 3. Find or create patient
    const patientId = await findOrCreatePatient(
      clinicId,
      firstName,
      lastName,
      body.patient_email ?? null
    );

    // 4. Build title in the format the app uses: "LASTNAME, FIRSTNAME - DAILY NOTE - YYYY-MM-DD"
    const title = `${lastName.toUpperCase()}, ${firstName.toUpperCase()} - DAILY NOTE - ${dateOfService}`;

    // 5. Build input_data in NoteInputData format + ptbot_external_id for dashboard filter
    const inputData: NoteInputData & { ptbot_external_id: string; ptbot_source?: string } = {
      dateOfService,
      patientDemographic: {
        patientName: `${lastName}, ${firstName}`,
      },
      subjective: {
        symptoms: body.soap.subjective || '',
        red_flags: body.flags?.red_flags || false,
      },
      objective: {
        key_measures: body.soap.objective || '',
      },
      assessment: {
        response_to_treatment: body.soap.assessment || '',
      },
      plan: {
        next_session_focus: body.recommendations ? [body.recommendations] : [],
        frequency_duration: body.soap.plan || '',
      },
      ptbot_external_id: body.external_id,
      ptbot_source: body.source || 'ptbot_telehealth',
    };

    // 6. Build output text
    const outputText = buildOutputText(
      body.soap,
      body.recommendations,
      body.flags,
      body.session,
      body.compliance
    );

    // 7. Check for existing note with same ptbot_external_id (idempotency)
    const { data: existingNote } = await supabaseAdmin
      .from('notes')
      .select('id')
      .eq('clinic_id', clinicId)
      .contains('input_data', { ptbot_external_id: body.external_id })
      .maybeSingle();

    if (existingNote) {
      // Update existing note
      const { data, error } = await supabaseAdmin
        .from('notes')
        .update({
          title,
          date_of_service: dateOfService,
          input_data: inputData,
          output_text: outputText,
          patient_id: patientId,
          rich_content: null, // Clear cached rich content so it re-converts
        })
        .eq('id', existingNote.id)
        .select('id')
        .single();

      if (error) {
        console.error('[ptbot/consult-notes] Update error:', error.message);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      console.log('[ptbot/consult-notes] Updated existing note', {
        ptbot_external_id: body.external_id,
        note_id: data.id,
      });

      return NextResponse.json({ success: true, record_id: data.id });
    }

    // 8. Insert new note into the notes table
    const { data, error } = await supabaseAdmin
      .from('notes')
      .insert({
        note_type: 'daily_soap',
        title,
        date_of_service: dateOfService,
        input_data: inputData,
        output_text: outputText,
        billing_justification: null,
        hep_summary: null,
        template_id: null,
        clinic_id: clinicId,
        patient_id: patientId,
        status: 'draft',
      })
      .select('id')
      .single();

    if (error) {
      console.error('[ptbot/consult-notes] Insert error:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    console.log('[ptbot/consult-notes] Note created from PTBot', {
      ptbot_external_id: body.external_id,
      note_id: data.id,
      patient_id: patientId,
    });

    return NextResponse.json(
      { success: true, record_id: data.id, patient_id: patientId },
      { status: 201 }
    );
  } catch (err) {
    console.error('[ptbot/consult-notes] Unexpected error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
