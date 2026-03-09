/**
 * Caseload Reports API
 * GET: Return caseload stats for a clinic
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinic_id');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (!clinicId) {
      return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });
    }

    // Fetch active episodes
    const { data: episodes, error: epError } = await client
      .from('episodes')
      .select('*')
      .eq('clinic_id', clinicId);

    if (epError) {
      console.error('Error fetching episodes for caseload:', epError);
      return NextResponse.json({ error: epError.message }, { status: 500 });
    }

    // Fetch patients
    const { data: patients, error: ptError } = await client
      .from('patients')
      .select('*')
      .eq('clinic_id', clinicId);

    if (ptError) {
      console.error('Error fetching patients for caseload:', ptError);
      return NextResponse.json({ error: ptError.message }, { status: 500 });
    }

    const allEpisodes = episodes || [];
    const allPatients = patients || [];

    const activeEpisodes = allEpisodes.filter((e) => e.status === 'active');
    const dischargedEpisodes = allEpisodes.filter((e) => e.status === 'discharged');

    // Filter by date range for new/discharged
    const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const toDate = to ? new Date(to) : new Date();

    const newPatientsThisMonth = allEpisodes.filter((e) => {
      const startDate = new Date(e.start_date);
      return startDate >= fromDate && startDate <= toDate;
    }).length;

    const dischargesThisMonth = dischargedEpisodes.filter((e) => {
      if (!e.discharged_at) return false;
      const dischDate = new Date(e.discharged_at);
      return dischDate >= fromDate && dischDate <= toDate;
    }).length;

    // Active episodes per therapist
    const therapistCaseload: Record<string, number> = {};
    for (const ep of activeEpisodes) {
      if (ep.primary_pt_id) {
        therapistCaseload[ep.primary_pt_id] =
          (therapistCaseload[ep.primary_pt_id] || 0) + 1;
      }
    }

    // Resolve therapist names from provider_profiles
    const therapistIds = Object.keys(therapistCaseload);
    const providerNameMap = new Map<string, string>();
    if (therapistIds.length > 0) {
      const { data: providers } = await client
        .from('provider_profiles')
        .select('user_id, first_name, last_name')
        .in('user_id', therapistIds)
        .eq('clinic_id', clinicId);
      if (providers) {
        for (const p of providers) {
          providerNameMap.set(p.user_id, `${p.first_name} ${p.last_name}`);
        }
      }
    }

    const caseloadPerTherapist = Object.entries(therapistCaseload).map(
      ([id, count]) => ({
        therapist_id: id,
        name: providerNameMap.get(id) || 'Unknown Therapist',
        active_episodes: count,
      })
    );

    // Referral source breakdown
    const referralMap: Record<string, number> = {};
    for (const pt of allPatients) {
      const source = pt.referring_physician || 'Unknown';
      referralMap[source] = (referralMap[source] || 0) + 1;
    }
    const referralSources = Object.entries(referralMap).map(([source, count]) => ({
      source,
      count,
    }));

    // Payer mix (insurance carrier counts)
    const payerMap: Record<string, number> = {};
    for (const pt of allPatients) {
      const payer = pt.insurance_id || 'Self-Pay';
      payerMap[payer] = (payerMap[payer] || 0) + 1;
    }
    const payerMix = Object.entries(payerMap).map(([payer, count]) => ({
      payer,
      count,
    }));

    return NextResponse.json({
      active_episodes: activeEpisodes.length,
      total_patients: allPatients.length,
      new_patients_this_month: newPatientsThisMonth,
      discharges_this_month: dischargesThisMonth,
      caseload_per_therapist: caseloadPerTherapist,
      referral_sources: referralSources,
      payer_mix: payerMix,
    });
  } catch (error) {
    console.error('Error in GET /api/reports/caseload:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
