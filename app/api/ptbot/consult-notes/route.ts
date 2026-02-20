/**
 * PTBot Consult Notes API
 * POST: Receive SOAP notes from PTBot and store as draft documents in AIDOCS
 *
 * Flow:
 * 1. Authenticate via Bearer token (PTBOT_API_KEY)
 * 2. Look up or auto-create patient from PTBot external ID
 * 3. Look up or auto-create episode ("PTBot Telehealth")
 * 4. Insert document as daily_note in draft status
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

const BUCKEYE_CLINIC_ID = 'd670e7f5-540c-41f2-98b3-8649f6355c6a';

interface PTBotNotePayload {
  external_id: string;          // PTBot auth.users UID
  patient_name: string;         // "First Last" or "Last, First"
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
    date?: string | null;        // ISO date string
    clinician_id?: string | null;
    delivery_method?: string | null;
  };
}

function parsePatientName(fullName: string): { firstName: string; lastName: string } {
  if (!fullName || typeof fullName !== 'string') {
    return { firstName: 'Unknown', lastName: 'Patient' };
  }

  const trimmed = fullName.trim();

  // Handle "Last, First" format
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map((p) => p.trim());
    return {
      lastName: parts[0] || 'Patient',
      firstName: parts[1] || 'Unknown',
    };
  }

  // Handle "First Last" format
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: 'Unknown' };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

function buildOutputText(soap: PTBotNotePayload['soap'], recommendations?: string | null): string {
  const sections: string[] = [];

  sections.push(`SUBJECTIVE:\n${soap.subjective || 'Not provided.'}`);
  sections.push(`OBJECTIVE:\n${soap.objective || 'Not provided.'}`);
  sections.push(`ASSESSMENT:\n${soap.assessment || 'Not provided.'}`);

  let planText = soap.plan || 'Not provided.';
  if (recommendations) {
    planText += `\n\nRecommendations: ${recommendations}`;
  }
  sections.push(`PLAN:\n${planText}`);

  return sections.join('\n\n');
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate via Bearer token
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const expectedKey = process.env.PTBOT_API_KEY;

    if (!expectedKey) {
      console.error('PTBOT_API_KEY environment variable is not configured');
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

    // 2. Parse and validate payload
    const body: PTBotNotePayload = await request.json();

    if (!body.external_id || !body.patient_name || !body.soap) {
      return NextResponse.json(
        { success: false, error: 'external_id, patient_name, and soap are required' },
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
  // Try to find by email first
  if (patientEmail) {
    const { data: existing } = await supabaseAdmin
      .from('patients')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('email', patientEmail)
      .maybeSingle();

    if (existing?.id) return existing.id;
  }

  // Split name into first/last
  const nameParts = patientName.trim().split(' ');
  const firstName = nameParts[0] || patientName;
  const lastName = nameParts.slice(1).join(' ') || '';

  // Create new patient
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
  lines.push(`Source: PTBot Telehealth`);
  if (session?.date) {
    lines.push(`Date of Service: ${new Date(session.date as string).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })}`);
  }
  if (session?.duration_minutes) {
    lines.push(`Session Duration: ${session.duration_minutes} minutes`);
  }
  lines.push('');

  if (soap?.subjective) {
    lines.push('SUBJECTIVE:');
    lines.push(soap.subjective);
    lines.push('');
  }

  if (soap?.objective) {
    lines.push('OBJECTIVE:');
    lines.push(soap.objective);
    lines.push('');
  }

  if (soap?.assessment) {
    lines.push('ASSESSMENT:');
    lines.push(soap.assessment);
    lines.push('');
  }

  if (soap?.plan) {
    lines.push('PLAN:');
    lines.push(soap.plan);
    lines.push('');
  }

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
      lines.push(`  Location Verified: Yes`);
    }
  }

  return lines.join('\n');
}

export async function POST(request: NextRequest) {
  // Auth check
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
    const {
      external_id,
      patient_name,
      patient_email,
      patient_phone,
      note_type,
      session,
    } = body as {
      external_id?: string;
      patient_name: string;
      patient_email?: string;
      patient_phone?: string;
      note_type?: string;
      session?: { date?: string; duration_minutes?: number };
    };

    if (!patient_name) {
      return NextResponse.json(
        { success: false, error: 'patient_name is required' },
        { status: 400 }
      );
    }

    const { firstName, lastName } = parsePatientName(body.patient_name);
    const dateOfService = body.session?.date || new Date().toISOString().split('T')[0];

    // 3. Look up patient by external ID
    const { data: existingLink } = await supabaseAdmin
      .from('patient_external_ids')
      .select('patient_id')
      .eq('source', 'ptbot')
      .eq('external_id', body.external_id)
      .single();

    let patientId: string;
    let episodeId: string;

    if (existingLink) {
      // Patient already linked — use existing patient
      patientId = existingLink.patient_id;

      // Find their PTBot Telehealth episode
      const { data: existingEpisode } = await supabaseAdmin
        .from('episodes')
        .select('id')
        .eq('patient_id', patientId)
        .eq('clinic_id', BUCKEYE_CLINIC_ID)
        .eq('diagnosis', 'PTBot Telehealth')
        .eq('status', 'active')
        .single();

      if (existingEpisode) {
        episodeId = existingEpisode.id;
      } else {
        // Episode was discharged or missing — create a new one
        const { data: newEpisode, error: episodeError } = await supabaseAdmin
          .from('episodes')
          .insert({
            patient_id: patientId,
            clinic_id: BUCKEYE_CLINIC_ID,
            start_date: dateOfService,
            status: 'active',
            diagnosis: 'PTBot Telehealth',
          })
          .select('id')
          .single();

        if (episodeError || !newEpisode) {
          console.error('Error creating episode:', episodeError);
          return NextResponse.json(
            { success: false, error: 'Failed to create episode' },
            { status: 500 }
          );
        }
        episodeId = newEpisode.id;
      }
    } else {
      // New patient — auto-create patient, link, and episode
      const { data: newPatient, error: patientError } = await supabaseAdmin
        .from('patients')
        .insert({
          clinic_id: BUCKEYE_CLINIC_ID,
          first_name: firstName,
          last_name: lastName,
          email: body.patient_email || null,
          is_active: true,
        })
        .select('id')
        .single();

      if (patientError || !newPatient) {
        console.error('Error creating patient:', patientError);
        return NextResponse.json(
          { success: false, error: 'Failed to create patient record' },
          { status: 500 }
        );
      }
      patientId = newPatient.id;

      // Create the external ID link
      const { error: linkError } = await supabaseAdmin
        .from('patient_external_ids')
        .insert({
          patient_id: patientId,
          source: 'ptbot',
          external_id: body.external_id,
        });

      if (linkError) {
        console.error('Error creating patient external ID link:', linkError);
        // Non-fatal — patient was created, link can be retried
      }

      // Create the episode
      const { data: newEpisode, error: episodeError } = await supabaseAdmin
        .from('episodes')
        .insert({
          patient_id: patientId,
          clinic_id: BUCKEYE_CLINIC_ID,
          start_date: dateOfService,
          status: 'active',
          diagnosis: 'PTBot Telehealth',
        })
        .select('id')
        .single();

      if (episodeError || !newEpisode) {
        console.error('Error creating episode:', episodeError);
        return NextResponse.json(
          { success: false, error: 'Failed to create episode' },
          { status: 500 }
        );
      }
      episodeId = newEpisode.id;
    }

    // 4. Build the document title: "LASTNAME, FIRSTNAME - DAILY NOTE - 2026-02-20"
    const title = `${lastName.toUpperCase()}, ${firstName.toUpperCase()} - DAILY NOTE - ${dateOfService}`;

    // 5. Build input_data in the NoteInputData format AIDOCS expects
    const inputData = {
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
        next_session_focus: body.recommendations
          ? [body.recommendations]
          : [],
        frequency_duration: body.soap.plan || '',
      },
    };

    // 6. Build the formatted output text
    const outputText = buildOutputText(body.soap, body.recommendations);

    // 7. Insert the document
    const { data: document, error: docError } = await supabaseAdmin
      .from('documents')
      .insert({
        episode_id: episodeId,
        clinic_id: BUCKEYE_CLINIC_ID,
        patient_id: patientId,
        doc_type: 'daily_note',
        title,
        date_of_service: dateOfService,
        input_data: inputData,
        output_text: outputText,
    // Find or create the patient
    const patientId = await findOrCreatePatient(
      clinicId,
      patient_name,
      patient_email ?? null,
      patient_phone ?? null
    );

    // Format note text
    const outputText = formatSOAPNote(body as Record<string, unknown>);

    // Map PTBot note_type to AIDOCS note_type enum ('daily_soap' | 'pt_evaluation')
    const docType = note_type === 'initial_evaluation' ? 'pt_evaluation' : 'daily_soap';

    // Check if note with this external_id already exists
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
      // Update existing
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

    // Create new note
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

    if (docError || !document) {
      console.error('Error creating document:', docError);
      return NextResponse.json(
        { success: false, error: 'Failed to create document' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        record_id: document.id,
        patient_id: patientId,
        episode_id: episodeId,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error in POST /api/ptbot/consult-notes:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
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
