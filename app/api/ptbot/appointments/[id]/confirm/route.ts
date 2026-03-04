/**
 * PTBot Confirm Appointment
 * POST /api/ptbot/appointments/[id]/confirm
 *
 * Allows an authenticated patient to confirm their upcoming appointment.
 * Checks both the visits and appointments (SMS) tables.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { authenticatePatient, isAuthError } from '@/lib/ptbot-patient-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Authenticate the requesting patient
    const auth = await authenticatePatient(request);
    if (isAuthError(auth)) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const patientId = auth.patient.id as string;

    // Try the visits table first
    const { data: visit } = await supabaseAdmin
      .from('visits')
      .select('id, patient_id, status')
      .eq('id', id)
      .single();

    if (visit) {
      // Verify ownership
      if (visit.patient_id !== patientId) {
        return NextResponse.json(
          { error: 'Access denied: this appointment belongs to another patient' },
          { status: 403 }
        );
      }

      if (visit.status !== 'scheduled') {
        return NextResponse.json(
          { error: `Cannot confirm: appointment is currently "${visit.status}"` },
          { status: 400 }
        );
      }

      const { data: updated, error } = await supabaseAdmin
        .from('visits')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id, status, start_time, visit_type')
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        source: 'visit',
        appointment: updated,
      });
    }

    // Try the SMS appointments table
    const { data: smsAppt } = await supabaseAdmin
      .from('appointments')
      .select('id, patient_id, status')
      .eq('id', id)
      .single();

    if (smsAppt) {
      if (smsAppt.patient_id !== patientId) {
        return NextResponse.json(
          { error: 'Access denied: this appointment belongs to another patient' },
          { status: 403 }
        );
      }

      if (smsAppt.status !== 'scheduled') {
        return NextResponse.json(
          { error: `Cannot confirm: appointment is currently "${smsAppt.status}"` },
          { status: 400 }
        );
      }

      const { data: updated, error } = await supabaseAdmin
        .from('appointments')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id, status, scheduled_at, visit_type')
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        source: 'sms',
        appointment: updated,
      });
    }

    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  } catch (error) {
    console.error('Error in POST /api/ptbot/appointments/[id]/confirm:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
