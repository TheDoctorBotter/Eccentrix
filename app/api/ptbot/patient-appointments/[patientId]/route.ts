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

    // Derive billing_status for visits (claim status > invoice status > 'unbilled')
    const visitIds = (visits || []).map(v => v.id);
    const billingStatusMap: Record<string, string> = {};

    if (visitIds.length > 0) {
      // Find charges for these visits that link to claim_lines -> claims
      const { data: chargesWithClaims } = await supabaseAdmin
        .from('visit_charges')
        .select('visit_id, claim_lines(claim_id, claims:claim_id(status))')
        .in('visit_id', visitIds)
        .eq('is_confirmed', true);

      for (const vc of (chargesWithClaims || [])) {
        if (!vc.visit_id) continue;
        for (const cl of (vc.claim_lines || [])) {
          const claim = (cl as unknown as { claims: { status: string } | null }).claims;
          if (claim && claim.status !== 'void') {
            billingStatusMap[vc.visit_id] = claim.status;
          }
        }
      }

      // Check invoices for visits not yet mapped
      const unmappedIds = visitIds.filter(id => !billingStatusMap[id]);
      if (unmappedIds.length > 0) {
        const { data: invoices } = await supabaseAdmin
          .from('invoices')
          .select('visit_id, status')
          .in('visit_id', unmappedIds)
          .neq('status', 'void');

        for (const inv of (invoices || [])) {
          if (inv.visit_id) billingStatusMap[inv.visit_id] = inv.status;
        }
      }

      // Default remaining to 'unbilled'
      for (const vid of visitIds) {
        if (!billingStatusMap[vid]) billingStatusMap[vid] = 'unbilled';
      }
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
        billing_status: billingStatusMap[v.id] || 'unbilled',
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
        billing_status: 'unbilled',
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Optional: active authorization summary (non-breaking)
    const { data: authData } = await supabaseAdmin
      .from('prior_authorizations')
      .select('discipline, auth_type, authorized_visits, used_visits, remaining_visits, units_authorized, units_used, end_date, status')
      .eq('patient_id', patientId)
      .eq('status', 'approved');

    const authSummary = (authData || []).map(a => ({
      discipline: a.discipline,
      auth_type: a.auth_type,
      remaining: a.auth_type === 'units'
        ? (a.units_authorized ?? 0) - (a.units_used ?? 0)
        : a.remaining_visits ?? ((a.authorized_visits ?? 0) - a.used_visits),
      end_date: a.end_date,
    }));

    return NextResponse.json({ appointments, auth_summary: authSummary });
  } catch (error) {
    console.error('Error in GET /api/ptbot/patient-appointments/[patientId]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
