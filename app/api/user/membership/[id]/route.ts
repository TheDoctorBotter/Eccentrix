/**
 * Membership Detail API
 * DELETE: Deactivate a clinic membership (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const membershipId = params.id;

    // Deactivate (soft delete) the membership
    const { error } = await client
      .from('clinic_memberships')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', membershipId);

    if (error) {
      console.error('Error deactivating membership:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/user/membership/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
