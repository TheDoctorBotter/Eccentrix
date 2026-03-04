/**
 * SMS Appointments API — fetch appointments booked via Buckeye Scheduler
 *
 * GET: List appointments from the shared `appointments` table where source = 'sms'.
 *      Joins with the `patients` table to resolve patient name and phone.
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

    // Query the appointments table with patient join
    let query = client
      .from('appointments')
      .select('*, patients(id, name, first_name, last_name, phone)')
      .eq('source', 'sms')
      .order('scheduled_at', { ascending: true });

    if (from) {
      query = query.gte('scheduled_at', from);
    }
    if (to) {
      query = query.lte('scheduled_at', to);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching SMS appointments:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Transform into Visit-shaped objects for the schedule page
    const visits = (data || []).map((appt: Record<string, unknown>) => {
      const scheduledAt = appt.scheduled_at as string;
      const visitType = appt.visit_type as string | null;
      const durationMinutes = DURATION_MAP[(visitType || '').toLowerCase()] || 45;

      // Calculate end time
      const startDate = new Date(scheduledAt);
      const endDate = new Date(startDate.getTime() + durationMinutes * 60_000);

      // Resolve patient name from the joined patients record
      const patient = appt.patients as Record<string, unknown> | null;
      let patientName = 'SMS Patient';
      let patientPhone = '';

      if (patient) {
        // The SMS scheduler's patients table may use `name` (single field)
        // or the EMR's `first_name` + `last_name` structure
        if (patient.name && typeof patient.name === 'string') {
          patientName = patient.name;
        } else if (patient.first_name || patient.last_name) {
          patientName = [patient.first_name, patient.last_name].filter(Boolean).join(' ');
        }
        patientPhone = (patient.phone as string) || '';
      }

      // Map SMS scheduler status to schedule page status
      const rawStatus = (appt.status as string) || 'scheduled';

      return {
        id: `sms-${appt.id}`,
        clinic_id: '',
        patient_id: patient ? (patient.id as string) : null,
        therapist_user_id: null,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        location: null,
        source: 'sms' as const,
        external_event_id: null,
        notes: null,
        status: rawStatus,
        cancelled_at: null,
        cancel_reason: null,
        recurrence_rule: null,
        recurrence_group_id: null,
        visit_type: visitType === 'eval' ? 'evaluation' : 'treatment',
        total_treatment_minutes: null,
        total_units: null,
        created_at: appt.created_at as string,
        updated_at: appt.created_at as string,
        patient_name: patientName,
        therapist_name: null,
        // SMS-specific fields
        sms_appointment_id: appt.id as string,
        sms_patient_phone: patientPhone,
      };
    });

    return NextResponse.json(visits);
  } catch (error) {
    console.error('Error in GET /api/appointments/sms:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
