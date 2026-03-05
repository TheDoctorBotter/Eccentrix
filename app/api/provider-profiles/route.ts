/**
 * Provider Profiles API
 * GET:  List provider profiles for a clinic
 * POST: Create/update provider profile (upsert by user_id + clinic_id)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';
import { ClinicRole } from '@/lib/types';

function deriveRoleFromCredentials(credentials: string | null | undefined): ClinicRole {
  if (!credentials) return 'pt';
  const c = credentials.toUpperCase();
  if (/\bSLPA\b/.test(c)) return 'slpa';
  if (/\bSLP\b|CCC-SLP|CF-SLP/.test(c)) return 'slp';
  if (/\bOTA\b|COTA\b/.test(c)) return 'ota';
  if (/\bOT\b|\bOTR\b|OTD\b|OTR\/L\b/.test(c)) return 'ot';
  if (/\bPTA\b/.test(c)) return 'pta';
  return 'pt';
}

export async function GET(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinic_id');

    if (!clinicId) {
      return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });
    }

    const { data, error } = await client
      .from('provider_profiles')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('last_name', { ascending: true });

    if (error) {
      console.error('Error fetching provider profiles:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Error in GET /api/provider-profiles:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const body = await request.json();
    const {
      user_id,
      clinic_id,
      first_name,
      last_name,
      credentials,
      npi,
      license_number,
      license_state,
      license_expiry,
      specialty,
      email,
      phone,
      default_appointment_duration,
      max_daily_patients,
      color,
      is_active,
    } = body;

    if (!user_id || !clinic_id || !first_name || !last_name) {
      return NextResponse.json(
        { error: 'user_id, clinic_id, first_name, and last_name are required' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const { data, error } = await client
      .from('provider_profiles')
      .upsert(
        {
          user_id,
          clinic_id,
          first_name,
          last_name,
          credentials: credentials || null,
          npi: npi || null,
          license_number: license_number || null,
          license_state: license_state || null,
          license_expiry: license_expiry || null,
          specialty: specialty || null,
          email: email || null,
          phone: phone || null,
          default_appointment_duration: default_appointment_duration || 45,
          max_daily_patients: max_daily_patients || null,
          color: color || null,
          is_active: is_active !== undefined ? is_active : true,
          created_at: now,
          updated_at: now,
        },
        { onConflict: 'user_id,clinic_id' }
      )
      .select()
      .single();

    if (error) {
      console.error('Error upserting provider profile:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Ensure a clinic_memberships row exists so this provider appears in care team dropdowns.
    // Determine role from credentials: if credentials contain "PTA" → pta, else → pt.
    try {
      const { data: clinic } = await client
        .from('clinics')
        .select('name')
        .eq('id', clinic_id)
        .single();

      if (clinic?.name) {
        const role = deriveRoleFromCredentials(credentials);
        await client
          .from('clinic_memberships')
          .upsert(
            {
              user_id,
              clinic_name: clinic.name,
              clinic_id_ref: clinic_id,
              clinic_id,
              role,
              is_active: is_active !== undefined ? is_active : true,
              updated_at: now,
            },
            { onConflict: 'user_id,clinic_name' }
          );
      }
    } catch (membershipError) {
      // Log but don't fail the provider creation
      console.error('Error syncing clinic membership:', membershipError);
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/provider-profiles:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
