/**
 * Alerts API
 * GET: Get documentation alerts for a clinic
 *
 * Alerts include:
 * - Daily notes due today (patients with visits scheduled)
 * - Evaluation drafts not finalized
 * - Re-evaluations due (based on episode duration)
 * - Progress notes due
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';
import { DocumentationAlert, AlertType } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinic_id');

    if (!clinicId) {
      return NextResponse.json(
        { error: 'clinic_id is required' },
        { status: 400 }
      );
    }

    const alerts: DocumentationAlert[] = [];
    const today = new Date().toISOString().split('T')[0];

    // 1. Find active episodes that might need daily notes
    // For now, we'll check if there's no document for today
    const { data: activeEpisodes, error: episodesError } = await client
      .from('active_episodes_view')
      .select('*')
      .eq('clinic_id', clinicId);

    if (episodesError) {
      console.error('Error fetching episodes for alerts:', episodesError);
    } else if (activeEpisodes) {
      for (const episode of activeEpisodes) {
        // Check if there's a document for today
        const { data: todayDocs, error: docsError } = await client
          .from('documents')
          .select('id')
          .eq('episode_id', episode.episode_id)
          .eq('date_of_service', today)
          .limit(1);

        if (docsError) {
          console.error('Error checking today docs:', docsError);
          continue;
        }

        // If no document for today, add alert
        // In a real system, you'd check against a schedule
        // For demo purposes, we'll randomly show some alerts
        if (!todayDocs || todayDocs.length === 0) {
          // Only show alert for some patients (simulated based on episode start)
          const startDate = new Date(episode.start_date);
          const daysSinceStart = Math.floor(
            (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24)
          );

          // Show daily note alert if multiple of 2 days since start
          if (daysSinceStart > 0 && daysSinceStart % 2 === 0) {
            alerts.push({
              id: `daily-${episode.episode_id}`,
              patient_id: episode.patient_id,
              episode_id: episode.episode_id,
              patient_name: `${episode.first_name} ${episode.last_name}`,
              alert_type: 'daily_note_due' as AlertType,
              alert_message: 'Daily note due today',
              due_date: today,
            });
          }

          // Show re-eval alert if 30+ days since start
          if (daysSinceStart >= 30 && daysSinceStart < 32) {
            alerts.push({
              id: `reeval-${episode.episode_id}`,
              patient_id: episode.patient_id,
              episode_id: episode.episode_id,
              patient_name: `${episode.first_name} ${episode.last_name}`,
              alert_type: 're_eval_due' as AlertType,
              alert_message: '30-day re-evaluation due',
              due_date: today,
            });
          }

          // Show progress note alert if 10+ days since start
          if (daysSinceStart >= 10 && daysSinceStart < 12) {
            alerts.push({
              id: `progress-${episode.episode_id}`,
              patient_id: episode.patient_id,
              episode_id: episode.episode_id,
              patient_name: `${episode.first_name} ${episode.last_name}`,
              alert_type: 'progress_note_due' as AlertType,
              alert_message: 'Progress note due',
              due_date: today,
            });
          }
        }
      }
    }

    // 2. Find draft evaluations that need finalization
    const { data: draftEvals, error: draftsError } = await client
      .from('documents')
      .select(`
        id,
        episode_id,
        patient_id,
        doc_type,
        patients(first_name, last_name)
      `)
      .eq('clinic_id', clinicId)
      .eq('status', 'draft')
      .in('doc_type', ['evaluation', 're_evaluation', 'progress_summary']);

    if (draftsError) {
      console.error('Error fetching draft evaluations:', draftsError);
    } else if (draftEvals) {
      for (const doc of draftEvals) {
        const patient = doc.patients as { first_name: string; last_name: string } | null;
        if (patient) {
          alerts.push({
            id: `draft-${doc.id}`,
            patient_id: doc.patient_id,
            episode_id: doc.episode_id,
            patient_name: `${patient.first_name} ${patient.last_name}`,
            alert_type: 'eval_draft' as AlertType,
            alert_message: `${doc.doc_type?.replace('_', ' ')} draft not finalized`,
            due_date: today,
          });
        }
      }
    }

    // Also check legacy notes table for draft evaluations
    const { data: draftNotes, error: notesError } = await client
      .from('notes')
      .select('id, clinic_name, doc_type, title')
      .eq('status', 'draft')
      .in('doc_type', ['evaluation', 're_evaluation', 'progress_summary'])
      .limit(10);

    if (notesError) {
      console.error('Error fetching draft notes:', notesError);
    } else if (draftNotes) {
      for (const note of draftNotes) {
        alerts.push({
          id: `note-draft-${note.id}`,
          patient_id: '',
          episode_id: '',
          patient_name: note.title || 'Unknown Patient',
          alert_type: 'eval_draft' as AlertType,
          alert_message: `${note.doc_type?.replace('_', ' ')} draft not finalized`,
          due_date: today,
        });
      }
    }

    return NextResponse.json(alerts);
  } catch (error) {
    console.error('Error in GET /api/alerts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
