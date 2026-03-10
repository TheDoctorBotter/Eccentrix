/**
 * PTBot Cancel Appointment
 * POST /api/ptbot/appointments/[id]/cancel
 *
 * Allows an authenticated patient to cancel their upcoming appointment.
 * Checks both the visits and appointments (SMS) tables.
 * Triggers an SMS notification back through Twilio when configured.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { authenticatePatient, isAuthError } from '@/lib/ptbot-patient-auth';
import { formatLocalDate } from '@/lib/utils';

/**
 * Send an SMS notification via Twilio when an appointment is cancelled.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  PLACEHOLDER — Twilio integration is not yet configured.            │
 * │  Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER  │
 * │  in your .env to enable SMS notifications.                          │
 * └──────────────────────────────────────────────────────────────────────┘
 */
async function sendCancellationSms(
  clinicPhone: string | null,
  patientName: string,
  appointmentDate: string
): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber || !clinicPhone) {
    console.log('[PTBot] Twilio not configured or no clinic phone — skipping SMS notification');
    return false;
  }

  try {
    const dateStr = formatLocalDate(appointmentDate, 'EEEE, MMMM d, h:mm a');

    const message = `[Eccentrix] Patient ${patientName} has cancelled their appointment on ${dateStr} via the patient app.`;

    // Twilio REST API call
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const twilioBody = new URLSearchParams({
      To: clinicPhone,
      From: fromNumber,
      Body: message,
    });

    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: twilioBody.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[PTBot] Twilio SMS send failed:', errorBody);
      return false;
    }

    console.log('[PTBot] Cancellation SMS sent to clinic');
    return true;
  } catch (err) {
    console.error('[PTBot] Failed to send Twilio SMS:', err);
    return false;
  }
}

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
    const patientName = [auth.patient.first_name, auth.patient.last_name].filter(Boolean).join(' ');

    // Optional: cancel reason from request body
    let cancelReason = 'Cancelled by patient via PTBot app';
    try {
      const body = await request.json();
      if (body.reason) {
        cancelReason = `Cancelled by patient via PTBot: ${body.reason}`;
      }
    } catch {
      // No body is OK — default reason applies
    }

    // Try the visits table first
    const { data: visit } = await supabaseAdmin
      .from('visits')
      .select('id, patient_id, status, start_time, clinic_id, discipline')
      .eq('id', id)
      .single();

    if (visit) {
      if (visit.patient_id !== patientId) {
        return NextResponse.json(
          { error: 'Access denied: this appointment belongs to another patient' },
          { status: 403 }
        );
      }

      if (!['scheduled', 'confirmed'].includes(visit.status)) {
        return NextResponse.json(
          { error: `Cannot cancel: appointment is currently "${visit.status}"` },
          { status: 400 }
        );
      }

      const { data: updated, error } = await supabaseAdmin
        .from('visits')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancel_reason: cancelReason,
          source: 'ptbot',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('id, status, start_time, visit_type, discipline')
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Send SMS notification to clinic
      let smsSent = false;
      if (visit.clinic_id) {
        const { data: clinic } = await supabaseAdmin
          .from('clinics')
          .select('phone')
          .eq('id', visit.clinic_id)
          .single();

        smsSent = await sendCancellationSms(
          clinic?.phone || null,
          patientName,
          visit.start_time
        );
      }

      return NextResponse.json({
        success: true,
        source: 'visit',
        appointment: {
          ...updated,
          discipline: (updated.discipline as string) || 'PT',
        },
        sms_notification_sent: smsSent,
      });
    }

    // Try the SMS appointments table
    const { data: smsAppt } = await supabaseAdmin
      .from('appointments')
      .select('id, patient_id, status, scheduled_at, clinic_id, discipline')
      .eq('id', id)
      .single();

    if (smsAppt) {
      if (smsAppt.patient_id !== patientId) {
        return NextResponse.json(
          { error: 'Access denied: this appointment belongs to another patient' },
          { status: 403 }
        );
      }

      if (!['scheduled', 'confirmed'].includes(smsAppt.status)) {
        return NextResponse.json(
          { error: `Cannot cancel: appointment is currently "${smsAppt.status}"` },
          { status: 400 }
        );
      }

      const { data: updated, error } = await supabaseAdmin
        .from('appointments')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('id, status, scheduled_at, visit_type, discipline')
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Send SMS notification to clinic
      let smsSent = false;
      if (smsAppt.clinic_id) {
        const { data: clinic } = await supabaseAdmin
          .from('clinics')
          .select('phone')
          .eq('id', smsAppt.clinic_id)
          .single();

        smsSent = await sendCancellationSms(
          clinic?.phone || null,
          patientName,
          smsAppt.scheduled_at
        );
      }

      return NextResponse.json({
        success: true,
        source: 'sms',
        appointment: {
          ...updated,
          discipline: (updated.discipline as string) || 'PT',
        },
        sms_notification_sent: smsSent,
      });
    }

    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  } catch (error) {
    console.error('Error in POST /api/ptbot/appointments/[id]/cancel:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
