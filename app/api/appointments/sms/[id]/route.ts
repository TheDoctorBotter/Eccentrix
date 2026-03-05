/**
 * Single SMS Appointment API — PATCH status updates
 *
 * PATCH /api/appointments/sms/[id]
 *   Updates the status field on the shared `appointments` table.
 *   When status is set to "completed", automatically creates a Visit record
 *   in the `visits` table pre-populated with patient ID, date of service,
 *   visit type, and therapist (if provided).
 *
 * Body:
 *   { status: string, therapist_user_id?: string, clinic_id?: string }
 *
 * IMPORTANT — BUCKEYE SCHEDULER / SMS SAFETY NOTE:
 * Insurance-based scheduling rules and evaluation visit-type clinician filtering
 * only apply to the UI scheduling flow (app/schedule/page.tsx via the
 * /api/eligible-clinicians endpoint). They do NOT apply here.
 * Buckeye Scheduler and PTBot insert appointments via SMS without going through
 * the scheduling UI, and these automated inserts must NOT be affected by
 * insurance-based or visit-type-based clinician filtering rules.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';

const DURATION_MAP: Record<string, number> = {
  eval: 60,
  evaluation: 60,
  treat: 45,
  treatment: 45,
};

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: 'Appointment ID is required' }, { status: 400 });
    }

    const body = await request.json();
    const { status, therapist_user_id, clinic_id } = body;

    if (!status) {
      return NextResponse.json({ error: 'status is required' }, { status: 400 });
    }

    // Update the appointments table — only set `status`.
    // The external appointments table may not have columns like updated_at.
    const updateData: Record<string, unknown> = { status };

    const { data: updatedAppt, error: updateError } = await client
      .from('appointments')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (updateError) {
      console.error('Error updating SMS appointment:', updateError);
      if (updateError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
      }
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    let createdVisit = null;

    // Auto-create Visit record when appointment is marked completed
    if (status === 'completed' && updatedAppt) {
      const scheduledAt = updatedAppt.scheduled_at as string;
      const visitType = updatedAppt.visit_type as string | null;
      const durationMinutes = DURATION_MAP[(visitType || '').toLowerCase()] || 45;

      const startDate = new Date(scheduledAt);
      const endDate = new Date(startDate.getTime() + durationMinutes * 60_000);

      const patientId = updatedAppt.patient_id as string;

      const visitPayload: Record<string, unknown> = {
        patient_id: patientId || null,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        visit_type: visitType === 'eval' ? 'evaluation' : (visitType || 'treatment'),
        source: 'sms',
        status: 'completed',
        notes: 'Auto-created from completed SMS appointment',
        discipline: (updatedAppt.discipline as string) || 'PT',
      };

      // Attach clinic_id and therapist if provided
      if (clinic_id) {
        visitPayload.clinic_id = clinic_id;
      }
      if (therapist_user_id) {
        visitPayload.therapist_user_id = therapist_user_id;
      }

      const { data: visit, error: visitError } = await client
        .from('visits')
        .insert(visitPayload)
        .select()
        .single();

      if (visitError) {
        console.error('Error auto-creating visit from SMS appointment:', visitError);
        // Don't fail the status update — the appointment was already updated.
        // Return a warning instead.
        return NextResponse.json({
          ...updatedAppt,
          discipline: (updatedAppt.discipline as string) || 'PT',
          _visitCreationWarning: `Appointment marked completed but Visit creation failed: ${visitError.message}`,
        });
      }

      createdVisit = visit;
    }

    return NextResponse.json({
      ...updatedAppt,
      discipline: (updatedAppt.discipline as string) || 'PT',
      _createdVisit: createdVisit,
    });
  } catch (error) {
    console.error('Error in PATCH /api/appointments/sms/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
