/**
 * Admin User Creation API
 * POST: Create a new Supabase auth user and assign them to a clinic
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'Service role key not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { email, password, full_name, role, clinic_id, clinic_name } = body;

    if (!email || !password || !role || !clinic_id || !clinic_name) {
      return NextResponse.json(
        { error: 'email, password, role, clinic_id, and clinic_name are required' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Create the user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: full_name || email,
      },
    });

    if (authError) {
      // Check for duplicate user
      if (authError.message?.includes('already been registered') || authError.message?.includes('already exists')) {
        return NextResponse.json(
          { error: 'A user with this email already exists. Use "Add Member" to add them to this clinic instead.' },
          { status: 409 }
        );
      }
      console.error('Error creating user:', authError);
      return NextResponse.json(
        { error: authError.message },
        { status: 500 }
      );
    }

    const userId = authData.user.id;

    // Create clinic membership
    const { error: membershipError } = await supabaseAdmin
      .from('clinic_memberships')
      .upsert(
        {
          user_id: userId,
          clinic_name,
          clinic_id_ref: clinic_id,
          clinic_id,
          role,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,clinic_name' }
      );

    if (membershipError) {
      console.error('Error creating membership:', membershipError);
      // User was created but membership failed - still return success with warning
      return NextResponse.json({
        success: true,
        user_id: userId,
        warning: 'User created but clinic assignment failed. Add them manually from the team page.',
      });
    }

    return NextResponse.json({
      success: true,
      user_id: userId,
      email: authData.user.email,
    });
  } catch (error) {
    console.error('Error in POST /api/user/create:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
