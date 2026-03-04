/**
 * Provider Profile Detail API
 * GET:   Get single provider profile
 * PATCH: Update provider profile
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const { id } = params;

    const { data, error } = await client
      .from('provider_profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching provider profile:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in GET /api/provider-profiles/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const body = await request.json();
    const { id } = params;

    const { data, error } = await client
      .from('provider_profiles')
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating provider profile:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Keep clinic_memberships role in sync when credentials change
    if (data && body.credentials !== undefined) {
      try {
        const { data: clinic } = await client
          .from('clinics')
          .select('name')
          .eq('id', data.clinic_id)
          .single();

        if (clinic?.name) {
          const role = data.credentials && /\bPTA\b/i.test(data.credentials) ? 'pta' : 'pt';
          await client
            .from('clinic_memberships')
            .upsert(
              {
                user_id: data.user_id,
                clinic_name: clinic.name,
                clinic_id_ref: data.clinic_id,
                clinic_id: data.clinic_id,
                role,
                is_active: data.is_active,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'user_id,clinic_name' }
            );
        }
      } catch (membershipError) {
        console.error('Error syncing clinic membership:', membershipError);
      }
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in PATCH /api/provider-profiles/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
