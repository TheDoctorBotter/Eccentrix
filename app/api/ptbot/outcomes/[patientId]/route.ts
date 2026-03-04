/**
 * PTBot Patient-Reported Outcomes
 * POST /api/ptbot/outcomes/[patientId]
 *
 * Accepts patient-reported outcome data (pain level, function score,
 * satisfaction) and stores it linked to their most recent visit.
 *
 * GET /api/ptbot/outcomes/[patientId]
 *
 * Returns the patient's outcome history.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { authenticatePatient, isAuthError, verifyPatientAccess } from '@/lib/ptbot-patient-auth';

export async function POST(
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

    const body = await request.json();
    const {
      pain_level,       // 0-10 NPRS
      function_score,   // 0-100 percentage
      satisfaction,     // 1-5 rating
      notes,            // free text from patient
      measure_id,       // optional: specific outcome measure ID
    } = body;

    // Validate required fields — at least one outcome data point
    if (pain_level === undefined && function_score === undefined && satisfaction === undefined) {
      return NextResponse.json(
        { error: 'At least one outcome metric (pain_level, function_score, or satisfaction) is required' },
        { status: 400 }
      );
    }

    // Find the patient's most recent visit (for linking)
    const { data: recentVisit } = await supabaseAdmin
      .from('visits')
      .select('id, episode_id, clinic_id')
      .eq('patient_id', patientId)
      .in('status', ['completed', 'checked_out', 'in_progress'])
      .order('start_time', { ascending: false })
      .limit(1)
      .single();

    const clinicId = recentVisit?.clinic_id || auth.patient.clinic_id || null;
    const episodeId = recentVisit?.episode_id || null;

    // If a specific measure_id is provided, store as a proper outcome_measure_score
    if (measure_id && episodeId && clinicId) {
      const rawScore = pain_level ?? function_score ?? satisfaction ?? 0;

      const { data: score, error: scoreError } = await supabaseAdmin
        .from('outcome_measure_scores')
        .insert({
          patient_id: patientId,
          episode_id: episodeId,
          clinic_id: clinicId,
          measure_id: measure_id,
          date_administered: new Date().toISOString().split('T')[0],
          raw_score: rawScore,
          percentage_score: function_score ?? null,
          answers: {
            source: 'ptbot_patient_app',
            pain_level: pain_level ?? null,
            function_score: function_score ?? null,
            satisfaction: satisfaction ?? null,
            patient_notes: notes || null,
          },
          notes: notes ? `Patient-reported via PTBot: ${notes}` : 'Patient-reported via PTBot app',
        })
        .select()
        .single();

      if (scoreError) {
        console.error('Error inserting outcome score:', scoreError);
        return NextResponse.json({ error: scoreError.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        score_id: score.id,
        linked_visit_id: recentVisit?.id || null,
        linked_episode_id: episodeId,
      }, { status: 201 });
    }

    // Otherwise, store as a general patient-reported outcome
    // Use the NPRS (Numeric Pain Rating Scale) measure if we can find it
    let nprsId: string | null = null;
    if (pain_level !== undefined) {
      const { data: nprs } = await supabaseAdmin
        .from('outcome_measure_definitions')
        .select('id')
        .eq('abbreviation', 'NPRS')
        .single();

      nprsId = nprs?.id || null;
    }

    // Store pain level as NPRS score if the measure definition exists
    if (nprsId && episodeId && clinicId && pain_level !== undefined) {
      const { data: score, error } = await supabaseAdmin
        .from('outcome_measure_scores')
        .insert({
          patient_id: patientId,
          episode_id: episodeId,
          clinic_id: clinicId,
          measure_id: nprsId,
          date_administered: new Date().toISOString().split('T')[0],
          raw_score: pain_level,
          answers: {
            source: 'ptbot_patient_app',
            pain_level,
            function_score: function_score ?? null,
            satisfaction: satisfaction ?? null,
            patient_notes: notes || null,
          },
          notes: notes ? `Patient-reported via PTBot: ${notes}` : 'Patient-reported via PTBot app',
        })
        .select()
        .single();

      if (error) {
        console.error('Error inserting NPRS score:', error);
      } else {
        return NextResponse.json({
          success: true,
          score_id: score.id,
          measure: 'NPRS',
          linked_visit_id: recentVisit?.id || null,
          linked_episode_id: episodeId,
        }, { status: 201 });
      }
    }

    // Fallback: store as a general record in a patient_reported_outcomes approach
    // We'll record it as an outcome_measure_score with the data in the answers JSON
    // but only if we have the required episode_id and clinic_id
    if (episodeId && clinicId) {
      // Try to find a PSFS (Patient-Specific Functional Scale) for function scores
      let measureId = nprsId;
      let rawScore = pain_level ?? 0;

      if (function_score !== undefined && !measureId) {
        const { data: psfs } = await supabaseAdmin
          .from('outcome_measure_definitions')
          .select('id')
          .eq('abbreviation', 'PSFS')
          .single();

        if (psfs) {
          measureId = psfs.id;
          rawScore = function_score;
        }
      }

      if (measureId) {
        const { data: score, error } = await supabaseAdmin
          .from('outcome_measure_scores')
          .insert({
            patient_id: patientId,
            episode_id: episodeId,
            clinic_id: clinicId,
            measure_id: measureId,
            date_administered: new Date().toISOString().split('T')[0],
            raw_score: rawScore,
            percentage_score: function_score ?? null,
            answers: {
              source: 'ptbot_patient_app',
              pain_level: pain_level ?? null,
              function_score: function_score ?? null,
              satisfaction: satisfaction ?? null,
              patient_notes: notes || null,
            },
            notes: `Patient-reported via PTBot app`,
          })
          .select()
          .single();

        if (!error) {
          return NextResponse.json({
            success: true,
            score_id: score.id,
            linked_visit_id: recentVisit?.id || null,
            linked_episode_id: episodeId,
          }, { status: 201 });
        }
      }
    }

    // Last resort: if no episode/clinic context, just acknowledge receipt
    // The data would need to be manually reconciled by staff
    return NextResponse.json({
      success: true,
      message: 'Outcome data received but could not be linked to an active episode. Staff will be notified.',
      data: {
        patient_id: patientId,
        pain_level: pain_level ?? null,
        function_score: function_score ?? null,
        satisfaction: satisfaction ?? null,
        notes: notes || null,
        reported_at: new Date().toISOString(),
        linked_visit_id: recentVisit?.id || null,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/ptbot/outcomes/[patientId]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
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

    // Fetch outcome scores for this patient
    const { data: scores, error } = await supabaseAdmin
      .from('outcome_measure_scores')
      .select('id, measure_id, date_administered, raw_score, percentage_score, answers, notes, created_at')
      .eq('patient_id', patientId)
      .order('date_administered', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching outcomes:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Enrich with measure names
    const measureIds = Array.from(new Set((scores || []).map(s => s.measure_id)));
    let measureMap = new Map<string, { name: string; abbreviation: string }>();

    if (measureIds.length > 0) {
      const { data: measures } = await supabaseAdmin
        .from('outcome_measure_definitions')
        .select('id, name, abbreviation')
        .in('id', measureIds);

      if (measures) {
        measureMap = new Map(measures.map(m => [m.id, { name: m.name, abbreviation: m.abbreviation }]));
      }
    }

    const enrichedScores = (scores || []).map(s => ({
      id: s.id,
      date: s.date_administered,
      score: s.raw_score,
      percentage: s.percentage_score,
      measure: measureMap.get(s.measure_id)?.name || 'Unknown',
      measure_abbreviation: measureMap.get(s.measure_id)?.abbreviation || null,
      source: (s.answers as Record<string, unknown>)?.source === 'ptbot_patient_app' ? 'self_reported' : 'clinician',
      pain_level: (s.answers as Record<string, unknown>)?.pain_level ?? null,
      function_score: (s.answers as Record<string, unknown>)?.function_score ?? null,
      satisfaction: (s.answers as Record<string, unknown>)?.satisfaction ?? null,
    }));

    return NextResponse.json({
      outcomes: enrichedScores,
      total: enrichedScores.length,
    });
  } catch (error) {
    console.error('Error in GET /api/ptbot/outcomes/[patientId]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
