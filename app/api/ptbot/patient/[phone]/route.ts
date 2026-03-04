/**
 * PTBot Patient Lookup
 * GET /api/ptbot/patient/[phone]
 *
 * Look up a patient by phone number. Returns their profile, upcoming
 * appointments, and recent visit history. The requesting patient must
 * be authenticated and can only look up their own phone number.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { authenticatePatient, isAuthError } from '@/lib/ptbot-patient-auth';

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  try {
    const { phone } = await params;

    // Authenticate the requesting patient
    const auth = await authenticatePatient(request);
    if (isAuthError(auth)) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // Verify the requested phone matches the authenticated patient's phone
    const normalizedRequestPhone = normalizePhone(decodeURIComponent(phone));
    const patientPhone = normalizePhone(String(auth.patient.phone || ''));

    // Allow match if the last 10 digits match (handles country code differences)
    const requestLast10 = normalizedRequestPhone.slice(-10);
    const patientLast10 = patientPhone.slice(-10);

    if (requestLast10 !== patientLast10) {
      return NextResponse.json(
        { error: 'Access denied: you can only look up your own profile' },
        { status: 403 }
      );
    }

    const patientId = auth.patient.id as string;

    // Fetch upcoming appointments (visits with status scheduled/confirmed, future dates)
    const now = new Date().toISOString();
    const { data: upcomingVisits } = await supabaseAdmin
      .from('visits')
      .select('id, start_time, end_time, visit_type, status, location, notes')
      .eq('patient_id', patientId)
      .in('status', ['scheduled', 'confirmed', 'checked_in'])
      .gte('start_time', now)
      .order('start_time', { ascending: true })
      .limit(10);

    // Also check SMS appointments table
    const { data: smsAppointments } = await supabaseAdmin
      .from('appointments')
      .select('id, scheduled_at, visit_type, status, notes')
      .eq('patient_id', patientId)
      .in('status', ['scheduled', 'confirmed'])
      .gte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(10);

    // Fetch recent visit history (last 10 completed visits)
    const { data: recentVisits } = await supabaseAdmin
      .from('visits')
      .select('id, start_time, end_time, visit_type, status, location')
      .eq('patient_id', patientId)
      .in('status', ['completed', 'checked_out'])
      .order('start_time', { ascending: false })
      .limit(10);

    // Build safe patient profile (exclude internal fields)
    const profile = {
      id: auth.patient.id,
      first_name: auth.patient.first_name,
      last_name: auth.patient.last_name,
      date_of_birth: auth.patient.date_of_birth,
      phone: auth.patient.phone,
      email: auth.patient.email,
      primary_diagnosis: auth.patient.primary_diagnosis,
      insurance_carrier: auth.patient.insurance_carrier,
      insurance_plan: auth.patient.insurance_plan,
    };

    return NextResponse.json({
      profile,
      upcoming_appointments: [
        ...(upcomingVisits || []).map(v => ({
          id: v.id,
          source: 'visit',
          date: v.start_time,
          end_time: v.end_time,
          visit_type: v.visit_type,
          status: v.status,
          location: v.location,
        })),
        ...(smsAppointments || []).map(a => ({
          id: a.id,
          source: 'sms',
          date: a.scheduled_at,
          end_time: null,
          visit_type: a.visit_type,
          status: a.status,
          location: null,
        })),
      ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
      recent_visits: (recentVisits || []).map(v => ({
        id: v.id,
        date: v.start_time,
        end_time: v.end_time,
        visit_type: v.visit_type,
        status: v.status,
        location: v.location,
      })),
    });
  } catch (error) {
    console.error('Error in GET /api/ptbot/patient/[phone]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
