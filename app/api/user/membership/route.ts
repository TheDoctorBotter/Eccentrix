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

    if (!user_id) {
      return NextResponse.json(
        { error: 'user_id is required' },
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
  role: ClinicRole;
}

export async function POST(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const body: CreateMembershipBody = await request.json();
    const { user_id, clinic_name, role } = body;

    if (!user_id || !clinic_name || !role) {
      return NextResponse.json(
        { error: 'user_id, clinic_name, and role are required' },
        { status: 400 }
      );
    }

    // Upsert membership
    const { data: membership, error } = await client
      .from('clinic_memberships')
      .upsert({
        user_id,
        clinic_name,
        role,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, {
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
