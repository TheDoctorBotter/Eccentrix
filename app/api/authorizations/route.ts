/**
 * Prior Authorizations API
 * GET:  List prior authorizations (filter by episode_id, patient_id, status)
 * POST: Create new authorization
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const { searchParams } = new URL(request.url);
    const episodeId = searchParams.get('episode_id');
    const patientId = searchParams.get('patient_id');
    const clinicId = searchParams.get('clinic_id');
    const status = searchParams.get('status');
    const discipline = searchParams.get('discipline');
    const activeForDate = searchParams.get('active_for_date');

    let query = client
      .from('prior_authorizations')
      .select('*')
      .order('created_at', { ascending: false });

    if (episodeId) {
      query = query.eq('episode_id', episodeId);
    }
    if (patientId) {
      query = query.eq('patient_id', patientId);
    }
    if (clinicId) {
      query = query.eq('clinic_id', clinicId);
    }
    if (status) {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      query = statuses.length === 1
        ? query.eq('status', statuses[0])
        : query.in('status', statuses);
    }
    if (discipline) {
      query = query.eq('discipline', discipline);
    }
    if (activeForDate) {
      query = query
        .lte('start_date', activeForDate)
        .gte('end_date', activeForDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching authorizations:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Error in GET /api/authorizations:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const body = await request.json();
    const {
      episode_id,
      patient_id,
      clinic_id,
      auth_number,
      insurance_name,
      insurance_phone,
      authorized_visits,
      start_date,
      end_date,
      requested_date,
      approved_date,
      status,
      notes,
      created_by,
      discipline,
      auth_type,
      units_authorized,
      day_180_date,
    } = body;

    if (!episode_id || !patient_id || !clinic_id || !start_date || !end_date) {
      return NextResponse.json(
        { error: 'episode_id, patient_id, clinic_id, start_date, and end_date are required' },
        { status: 400 }
      );
    }

    // Build insert payload — do NOT include remaining_visits (it's a GENERATED column)
    const insertData: Record<string, unknown> = {
      episode_id,
      patient_id,
      clinic_id,
      auth_number: auth_number || null,
      insurance_name: insurance_name || null,
      insurance_phone: insurance_phone || null,
      used_visits: 0,
      start_date,
      end_date,
      requested_date: requested_date || null,
      approved_date: approved_date || null,
      status: status || 'pending',
      notes: notes || null,
      created_by: created_by || null,
      discipline: discipline || null,
      auth_type: auth_type || 'visits',
    };

    if (auth_type === 'units') {
      insertData.units_authorized = units_authorized ? parseInt(String(units_authorized), 10) : null;
      insertData.units_used = 0;
      insertData.authorized_visits = null;
    } else {
      insertData.authorized_visits = authorized_visits ? parseInt(String(authorized_visits), 10) : null;
    }

    // Auto-calculate 180-day date from start_date if not explicitly provided
    if (day_180_date) {
      insertData.day_180_date = day_180_date;
    } else if (start_date) {
      const d = new Date(start_date);
      d.setDate(d.getDate() + 180);
      insertData.day_180_date = d.toISOString().split('T')[0];
    }

    const { data, error } = await client
      .from('prior_authorizations')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Error creating authorization:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/authorizations:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
