/**
 * Clinic Members API
 *
 * GET: List all active members of a clinic with display names from provider_profiles.
 *      Used by the schedule page to populate therapist dropdowns.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';
import { roleToDiscipline } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinic_id');

    if (!clinicId) {
      return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });
    }

    // Fetch clinic memberships
    const { data: members, error } = await client
      .from('clinic_memberships')
      .select('*')
      .or(`clinic_id_ref.eq.${clinicId},clinic_id.eq.${clinicId}`)
      .eq('is_active', true)
      .order('role');

    if (error) {
      console.error('Error fetching clinic members:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch provider profiles for display names
    const userIds = (members || []).map((m: Record<string, unknown>) => m.user_id as string);
    let providerMap = new Map<string, { first_name: string; last_name: string; credentials: string | null; primary_discipline: string | null }>();

    if (userIds.length > 0) {
      const { data: providers } = await client
        .from('provider_profiles')
        .select('user_id, first_name, last_name, credentials, primary_discipline')
        .in('user_id', userIds)
        .eq('is_active', true);

      if (providers) {
        providerMap = new Map(
          providers.map((p: { user_id: string; first_name: string; last_name: string; credentials: string | null; primary_discipline: string | null }) => [
            p.user_id,
            { first_name: p.first_name, last_name: p.last_name, credentials: p.credentials, primary_discipline: p.primary_discipline },
          ])
        );
      }
    }

    const result = (members || []).map((m: Record<string, unknown>) => {
      const userId = m.user_id as string;
      const provider = providerMap.get(userId);
      const displayName = provider
        ? `${provider.first_name} ${provider.last_name}${provider.credentials ? `, ${provider.credentials}` : ''}`
        : userId.slice(0, 8) + '...';

      return {
        user_id: userId,
        email: displayName,
        display_name: displayName,
        first_name: provider?.first_name || null,
        last_name: provider?.last_name || null,
        primary_discipline: provider?.primary_discipline || roleToDiscipline(m.role as string),
        role: m.role,
        is_active: m.is_active,
        clinic_name: m.clinic_name,
        id: m.id,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in GET /api/clinic-members:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
