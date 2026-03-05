/**
 * User Membership API
 *
 * GET: Get current user's clinic memberships and roles
 * POST: Create/update a user's clinic membership (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';
import { ClinicRole } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const { searchParams } = new URL(request.url);
    const user_id = searchParams.get('user_id');
    const clinic_id = searchParams.get('clinic_id');

    // If clinic_id is provided, return all staff members for that clinic
    if (clinic_id) {
      const { data: staffMembers, error } = await client
        .from('clinic_memberships')
        .select('*')
        .or(`clinic_id_ref.eq.${clinic_id},clinic_id.eq.${clinic_id}`)
        .eq('is_active', true)
        .order('role');

      if (error) {
        console.error('Error fetching clinic staff:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Fetch provider profiles for these users to get display names
      const userIds = (staffMembers || []).map((m: Record<string, unknown>) => m.user_id as string);
      let providerMap = new Map<string, { first_name: string; last_name: string; credentials: string | null }>();
      let emailMap = new Map<string, string>();

      if (userIds.length > 0) {
        const { data: providers } = await client
          .from('provider_profiles')
          .select('user_id, first_name, last_name, credentials')
          .in('user_id', userIds)
          .eq('is_active', true);

        if (providers) {
          providerMap = new Map(
            providers.map((p: { user_id: string; first_name: string; last_name: string; credentials: string | null }) => [
              p.user_id,
              { first_name: p.first_name, last_name: p.last_name, credentials: p.credentials },
            ])
          );
        }

        // Fetch emails from auth.users for users without provider profiles
        const usersWithoutProfile = userIds.filter((id) => !providerMap.has(id));
        if (usersWithoutProfile.length > 0 && serviceRoleKey) {
          const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
          if (authUsers?.users) {
            for (const u of authUsers.users) {
              if (usersWithoutProfile.includes(u.id)) {
                emailMap.set(u.id, u.email || '');
              }
            }
          }
        }
      }

      return NextResponse.json(
        (staffMembers || []).map((m: Record<string, unknown>) => {
          const userId = m.user_id as string;
          const provider = providerMap.get(userId);
          const email = emailMap.get(userId);
          const displayName = provider
            ? `${provider.first_name} ${provider.last_name}${provider.credentials ? `, ${provider.credentials}` : ''}`
            : email || userId.slice(0, 8) + '...';

          return {
            user_id: userId,
            email: email || displayName,
            display_name: displayName,
            first_name: provider?.first_name || null,
            last_name: provider?.last_name || null,
            credentials: provider?.credentials || null,
            has_provider_profile: !!provider,
            role: m.role,
            clinic_name: m.clinic_name,
            id: m.id,
          };
        })
      );
    }

    if (!user_id) {
      return NextResponse.json(
        { error: 'user_id or clinic_id is required' },
        { status: 400 }
      );
    }

    const { data: memberships, error } = await client
      .from('clinic_memberships')
      .select('*')
      .eq('user_id', user_id)
      .eq('is_active', true);

    if (error) {
      console.error('Error fetching memberships:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Determine primary role (PT takes precedence)
    let primaryRole: ClinicRole = 'front_office';
    if (memberships && memberships.length > 0) {
      if (memberships.some(m => m.role === 'pt')) {
        primaryRole = 'pt';
      } else if (memberships.some(m => m.role === 'pta')) {
        primaryRole = 'pta';
      } else if (memberships.some(m => m.role === 'admin')) {
        primaryRole = 'admin';
      }
    }

    return NextResponse.json({
      memberships: memberships || [],
      primaryRole,
      isPT: primaryRole === 'pt',
      canFinalize: primaryRole === 'pt',
    });
  } catch (error) {
    console.error('Error in GET /api/user/membership:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

interface CreateMembershipBody {
  user_id: string;
  clinic_name: string;
  clinic_id_ref?: string;
  role: ClinicRole;
}

export async function POST(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const body: CreateMembershipBody = await request.json();
    const { user_id, clinic_name, clinic_id_ref, role } = body;

    if (!user_id || !clinic_name || !role) {
      return NextResponse.json(
        { error: 'user_id, clinic_name, and role are required' },
        { status: 400 }
      );
    }

    // Upsert membership
    const upsertData: Record<string, unknown> = {
      user_id,
      clinic_name,
      role,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    // Set both clinic_id fields if provided
    if (clinic_id_ref) {
      upsertData.clinic_id_ref = clinic_id_ref;
      upsertData.clinic_id = clinic_id_ref;
    }

    const { data: membership, error } = await client
      .from('clinic_memberships')
      .upsert(upsertData, {
        onConflict: 'user_id,clinic_name',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating membership:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      membership,
    });
  } catch (error) {
    console.error('Error in POST /api/user/membership:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
