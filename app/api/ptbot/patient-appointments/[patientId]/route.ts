/**
 * PTBot Patient Appointments
 * GET /api/ptbot/patient-appointments/[patientId]
 *
 * Returns all upcoming appointments for the authenticated patient,
 * including both internal visits and SMS-booked appointments.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { authenticatePatient, isAuthError, verifyPatientAccess } from '@/lib/ptbot-patient-auth';

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

    const now = new Date().toISOString();

    // Fetch upcoming visits from the visits table
    const { data: visits, error: visitsError } = await supabaseAdmin
      .from('visits')
      .select('id, start_time, end_time, visit_type, status, location, notes, discipline')
      .eq('patient_id', patientId)
      .in('status', ['scheduled', 'confirmed', 'checked_in', 'in_progress'])
      .gte('start_time', now)
      .order('start_time', { ascending: true });

    if (visitsError) {
      console.error('Error fetching visits:', visitsError);
    }

    // Fetch upcoming SMS appointments
    const { data: smsAppts, error: smsError } = await supabaseAdmin
      .from('appointments')
      .select('id, scheduled_at, visit_type, status, notes, discipline')
      .eq('patient_id', patientId)
      .in('status', ['scheduled', 'confirmed'])
      .gte('scheduled_at', now)
      .order('scheduled_at', { ascending: true });

    if (smsError) {
      console.error('Error fetching SMS appointments:', smsError);
    }

    // Combine and normalize into a unified format
    const appointments = [
      ...(visits || []).map(v => ({
        id: v.id,
        source: 'visit' as const,
        date: v.start_time,
        end_time: v.end_time,
        visit_type: v.visit_type || 'treatment',
        status: v.status,
        location: v.location,
        discipline: (v.discipline as string) || 'PT',
        can_confirm: v.status === 'scheduled',
        can_cancel: ['scheduled', 'confirmed'].includes(v.status),
      })),
      ...(smsAppts || []).map(a => ({
        id: a.id,
        source: 'sms' as const,
        date: a.scheduled_at,
        end_time: null,
        visit_type: a.visit_type || 'treatment',
        status: a.status,
        location: null,
        discipline: (a.discipline as string) || 'PT',
        can_confirm: a.status === 'scheduled',
        can_cancel: ['scheduled', 'confirmed'].includes(a.status),
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return NextResponse.json({ appointments });
  } catch (error) {
    console.error('Error in GET /api/ptbot/patient-appointments/[patientId]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
