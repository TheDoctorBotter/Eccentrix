/**
 * PTBot Patient Notes
 * GET /api/ptbot/notes/[patientId]
 *
 * Returns finalized SOAP notes for the patient in a patient-friendly
 * summary format. Raw clinical text is transformed into plain-language
 * sections the patient can understand.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { authenticatePatient, isAuthError, verifyPatientAccess } from '@/lib/ptbot-patient-auth';

/**
 * Transform a clinical SOAP note into a patient-friendly summary.
 * Extracts key information without clinical jargon.
 */
function summarizeForPatient(note: {
  id: string;
  title?: string | null;
  date_of_service?: string | null;
  note_type?: string | null;
  input_data?: Record<string, unknown> | null;
  output_text?: string | null;
  created_at: string;
}): Record<string, unknown> {
  const inputData = (note.input_data || {}) as {
    dateOfService?: string;
    startTime?: string;
    endTime?: string;
    patientDemographic?: { patientName?: string; diagnosis?: string };
    subjective?: { symptoms?: string; pain_level?: number; functional_limits?: string };
    objective?: { interventions?: Array<{ name: string; dosage?: string }> };
    assessment?: { progression?: string };
    plan?: {
      frequency_duration?: string;
      next_session_focus?: string;
      hep?: string;
      education_provided?: string;
    };
  };

  // Build a patient-friendly summary
  const summary: Record<string, unknown> = {
    id: note.id,
    date: note.date_of_service || inputData.dateOfService || note.created_at.split('T')[0],
    visit_type: note.note_type === 'daily_soap' ? 'Treatment Visit'
      : note.note_type === 'pt_evaluation' ? 'Evaluation Visit'
      : 'Visit Note',
  };

  // Time info
  if (inputData.startTime && inputData.endTime) {
    summary.time = `${inputData.startTime} - ${inputData.endTime}`;
  }

  // What you told us (from Subjective)
  if (inputData.subjective) {
    const subj = inputData.subjective;
    const whatYouToldUs: string[] = [];
    if (subj.symptoms) whatYouToldUs.push(subj.symptoms);
    if (subj.pain_level !== undefined && subj.pain_level !== null) {
      whatYouToldUs.push(`Pain level: ${subj.pain_level}/10`);
    }
    if (subj.functional_limits) whatYouToldUs.push(subj.functional_limits);
    if (whatYouToldUs.length > 0) {
      summary.what_you_reported = whatYouToldUs.join('. ');
    }
  }

  // What we did (from Objective — interventions)
  if (inputData.objective?.interventions && inputData.objective.interventions.length > 0) {
    summary.treatments_performed = inputData.objective.interventions.map(i => {
      let desc = i.name;
      if (i.dosage) desc += ` (${i.dosage})`;
      return desc;
    });
  }

  // Progress (from Assessment)
  if (inputData.assessment?.progression) {
    const progressMap: Record<string, string> = {
      improving: 'You are making progress toward your goals.',
      stable: 'Your condition is stable.',
      declining: 'We noticed some changes and may adjust your treatment plan.',
      plateau: 'Your progress has plateaued — we may update your plan.',
    };
    summary.progress = progressMap[inputData.assessment.progression]
      || `Progress: ${inputData.assessment.progression}`;
  }

  // Your plan going forward (from Plan)
  if (inputData.plan) {
    const plan = inputData.plan;
    const planItems: string[] = [];
    if (plan.frequency_duration) planItems.push(`Visit schedule: ${plan.frequency_duration}`);
    if (plan.next_session_focus) planItems.push(`Next visit focus: ${plan.next_session_focus}`);
    if (plan.education_provided) planItems.push(`Education: ${plan.education_provided}`);
    if (planItems.length > 0) {
      summary.your_plan = planItems;
    }
  }

  // Home exercises
  if (inputData.plan?.hep) {
    summary.home_exercises = inputData.plan.hep;
  }

  // If we couldn't extract structured data, provide a minimal summary
  // from the raw output_text (extract just the PLAN section)
  if (!summary.treatments_performed && !summary.what_you_reported && note.output_text) {
    const planMatch = note.output_text.match(/PLAN[:\s]*\n([\s\S]*?)(?=\n[A-Z]{3,}|$)/i);
    if (planMatch) {
      summary.your_plan = [planMatch[1].trim()];
    }
    summary.summary_note = 'A detailed clinical note was documented for this visit.';
  }

  return summary;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ patientId: string }> }
) {
  try {
    const { patientId } = await params;

    // Authenticate and verify access
    const auth = await authenticatePatient(request);
    if (isAuthError(auth)) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const accessError = verifyPatientAccess(auth.patient.id as string, patientId);
    if (accessError) return accessError;

    // Fetch finalized notes for this patient
    // Check both the notes table (with patient_id) and documents table
    const { data: notes, error: notesError } = await supabaseAdmin
      .from('notes')
      .select('id, title, date_of_service, note_type, input_data, output_text, created_at, status')
      .eq('patient_id', patientId)
      .eq('status', 'final')
      .order('date_of_service', { ascending: false })
      .limit(20);

    if (notesError) {
      console.error('Error fetching notes:', notesError);
    }

    // Also fetch finalized documents
    const { data: documents, error: docsError } = await supabaseAdmin
      .from('documents')
      .select('id, title, date_of_service, doc_type, input_data, output_text, created_at, status')
      .eq('patient_id', patientId)
      .eq('status', 'final')
      .order('date_of_service', { ascending: false })
      .limit(20);

    if (docsError) {
      console.error('Error fetching documents:', docsError);
    }

    // Combine and transform into patient-friendly summaries
    const allNotes = [
      ...(notes || []).map(n => ({
        ...n,
        note_type: n.note_type,
      })),
      ...(documents || []).map(d => ({
        ...d,
        note_type: d.doc_type === 'daily_note' ? 'daily_soap'
          : d.doc_type === 'evaluation' ? 'pt_evaluation'
          : d.doc_type,
      })),
    ];

    // Deduplicate by id
    const seen = new Set<string>();
    const uniqueNotes = allNotes.filter(n => {
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });

    // Sort by date descending
    uniqueNotes.sort((a, b) => {
      const dateA = a.date_of_service || a.created_at;
      const dateB = b.date_of_service || b.created_at;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    const summaries = uniqueNotes.map(summarizeForPatient);

    return NextResponse.json({
      notes: summaries,
      total: summaries.length,
    });
  } catch (error) {
    console.error('Error in GET /api/ptbot/notes/[patientId]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
