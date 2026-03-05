/**
 * SMS Appointments API — fetch appointments from the `appointments` table
 *
 * GET: List appointments from the shared `appointments` table.
 *      Attempts to join with the `patients` table to resolve patient name and phone.
 *      Returns data shaped like Visit objects so the schedule page can merge them.
 *
 * Query params:
 *   - from: ISO date string — filter appointments on or after this time
 *   - to:   ISO date string — filter appointments on or before this time
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';

/** Default appointment duration by visit type (minutes). */
const DURATION_MAP: Record<string, number> = {
  eval: 60,
  evaluation: 60,
  treat: 45,
  treatment: 45,
};

export async function GET(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    console.log('[GET /api/appointments/sms] from:', from, 'to:', to);

    // Try querying with patient join first; if that fails, query without join
    let data: Record<string, unknown>[] | null = null;
    let joinWorked = true;

    // First attempt: with patient join and source filter
    {
      let query = client
        .from('appointments')
        .select('*, patients(id, first_name, last_name, phone)')
        .order('scheduled_at', { ascending: true });

      if (from) {
        query = query.gte('scheduled_at', from);
      }
      if (to) {
        query = query.lte('scheduled_at', to);
      }

      const result = await query;

      if (result.error) {
        console.error('[GET /api/appointments/sms] Query with join failed:', result.error.message);
        joinWorked = false;
      } else {
        data = result.data;
      }
    }

    // Second attempt: without patient join (in case FK relationship doesn't exist)
    if (!joinWorked) {
      let query = client
        .from('appointments')
        .select('*')
        .order('scheduled_at', { ascending: true });

      if (from) {
        query = query.gte('scheduled_at', from);
      }
      if (to) {
        query = query.lte('scheduled_at', to);
      }

      const result = await query;

      if (result.error) {
        console.error('[GET /api/appointments/sms] Query without join also failed:', result.error.message);
        return NextResponse.json({ error: result.error.message }, { status: 500 });
      }

      data = result.data;
    }

    console.log('[GET /api/appointments/sms] raw results:', data?.length ?? 0, 'appointments');
    if (data && data.length > 0) {
      console.log('[GET /api/appointments/sms] first appointment:', JSON.stringify(data[0], null, 2));
    }

    // Transform into Visit-shaped objects for the schedule page
    const visits = (data || []).map((appt: Record<string, unknown>) => {
      // Support both `scheduled_at` and `start_time` column names
      const scheduledAt = (appt.scheduled_at || appt.start_time || appt.date) as string;
      if (!scheduledAt) {
        console.warn('[GET /api/appointments/sms] Appointment missing scheduled_at:', appt.id);
        return null;
      }

      const visitType = appt.visit_type as string | null;
      const durationMinutes = DURATION_MAP[(visitType || '').toLowerCase()] || 45;

      // Calculate end time
      const startDate = new Date(scheduledAt);
      const endDate = appt.end_time
        ? new Date(appt.end_time as string)
        : new Date(startDate.getTime() + durationMinutes * 60_000);

      // Resolve patient name from the joined patients record (if join worked)
      const patient = appt.patients as Record<string, unknown> | null;
      let patientName = (appt.patient_name as string) || 'Appointment';
      let patientPhone = '';

      if (patient) {
        if (patient.first_name || patient.last_name) {
          patientName = [patient.first_name, patient.last_name].filter(Boolean).join(' ');
        }
        patientPhone = (patient.phone as string) || '';
      }

      // Map status
      const rawStatus = (appt.status as string) || 'scheduled';

      return {
        id: `sms-${appt.id}`,
        clinic_id: (appt.clinic_id as string) || '',
        patient_id: patient ? (patient.id as string) : (appt.patient_id as string) || null,
        therapist_user_id: (appt.therapist_user_id as string) || null,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        location: (appt.location as string) || null,
        source: 'sms' as const,
        external_event_id: null,
        notes: (appt.notes as string) || null,
        status: rawStatus,
        cancelled_at: null,
        cancel_reason: null,
        recurrence_rule: null,
        recurrence_group_id: null,
        visit_type: visitType === 'eval' ? 'evaluation' : (visitType || 'treatment'),
        discipline: (appt.discipline as string) || 'PT',
        total_treatment_minutes: null,
        total_units: null,
        created_at: appt.created_at as string,
        updated_at: (appt.updated_at || appt.created_at) as string,
        patient_name: patientName,
        therapist_name: null,
        // SMS-specific fields
        sms_appointment_id: appt.id as string,
        sms_patient_phone: patientPhone,
      };
    }).filter(Boolean);

    console.log('[GET /api/appointments/sms] transformed:', visits.length, 'visit-shaped objects');

    return NextResponse.json(visits);
  } catch (error) {
    console.error('Error in GET /api/appointments/sms:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
