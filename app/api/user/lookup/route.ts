/**
 * User Lookup API
 * GET: Look up a user by email (admin only, uses service role)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'Service role key not configured' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json(
        { error: 'email is required' },
        { status: 400 }
      );
    }

    // Look up user by email using admin API
    const { data: authUsers, error } = await supabaseAdmin.auth.admin.listUsers();

    if (error) {
      console.error('Error listing users:', error);
      return NextResponse.json(
        { error: 'Failed to look up user' },
        { status: 500 }
      );
    }

    const matchedUser = authUsers?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (!matchedUser) {
      return NextResponse.json(
        { error: 'No account found with that email. The user must sign up first.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      user_id: matchedUser.id,
      email: matchedUser.email,
    });
  } catch (error) {
    console.error('Error in GET /api/user/lookup:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
