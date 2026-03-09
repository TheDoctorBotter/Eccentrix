/**
 * Productivity Reports API
 * GET: Return productivity stats for a date range and clinic_id
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

    // Fetch all visits in date range
    let query = client
      .from('visits')
      .select('*')
      .eq('clinic_id', clinicId);

    if (from) {
      query = query.gte('start_time', from);
    }

    if (to) {
      query = query.lte('start_time', to);
    }

    const { data: visits, error } = await query;

    if (error) {
      console.error('Error fetching visits for productivity:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const allVisits = visits || [];
    const totalVisits = allVisits.length;
    const cancelledVisits = allVisits.filter((v) => v.status === 'cancelled').length;
    const noShowVisits = allVisits.filter((v) => v.status === 'no_show').length;
    const completedVisits = allVisits.filter((v) =>
      ['completed', 'checked_out'].includes(v.status)
    );

    // Avg units per visit
    const totalUnits = completedVisits.reduce(
      (sum, v) => sum + (v.total_units || 0),
      0
    );
    const avgUnits =
      completedVisits.length > 0
        ? Math.round((totalUnits / completedVisits.length) * 100) / 100
        : 0;

    // Cancellation and no-show rates
    const cancellationRate =
      totalVisits > 0
        ? Math.round((cancelledVisits / totalVisits) * 10000) / 100
        : 0;
    const noShowRate =
      totalVisits > 0
        ? Math.round((noShowVisits / totalVisits) * 10000) / 100
        : 0;

    // Fetch provider profiles to resolve therapist names
    const therapistIds = [
      ...new Set(allVisits.map((v) => v.therapist_user_id).filter(Boolean)),
    ];
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

    // Visits per therapist
    const therapistMap: Record<string, { name: string; count: number; units: number }> =
      {};
    for (const visit of allVisits) {
      if (visit.therapist_user_id) {
        if (!therapistMap[visit.therapist_user_id]) {
          therapistMap[visit.therapist_user_id] = {
            name: providerNameMap.get(visit.therapist_user_id) || 'Unknown Therapist',
            count: 0,
            units: 0,
          };
        }
        therapistMap[visit.therapist_user_id].count += 1;
        therapistMap[visit.therapist_user_id].units += visit.total_units || 0;
      }
    }

    // Daily visit counts for line chart
    const dailyMap: Record<string, number> = {};
    for (const visit of allVisits) {
      const day = visit.start_time?.split('T')[0];
      if (day) {
        dailyMap[day] = (dailyMap[day] || 0) + 1;
      }
    }
    const dailyVisits = Object.entries(dailyMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      total_visits: totalVisits,
      completed_visits: completedVisits.length,
      cancelled_visits: cancelledVisits,
      no_show_visits: noShowVisits,
      avg_units_per_visit: avgUnits,
      cancellation_rate: cancellationRate,
      no_show_rate: noShowRate,
      visits_per_therapist: Object.values(therapistMap),
      daily_visits: dailyVisits,
    });
  } catch (error) {
    console.error('Error in GET /api/reports/productivity:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
