import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: patientId } = await params;
    const { email, password, reason } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Authenticate by verifying the admin's credentials
    // Use a fresh client so we don't pollute any shared state
    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );

    const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !signInData.user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const user = signInData.user;

    // Check if user is an admin for the patient's clinic
    const { data: patient, error: patientError } = await supabaseAdmin
      .from('patients')
      .select('clinic_id')
      .eq('id', patientId)
      .single();

    if (patientError || !patient) {
      return NextResponse.json(
        { error: 'Patient not found' },
        { status: 404 }
      );
    }

    // Verify user is admin or super_admin for this clinic
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('clinic_memberships')
      .select('role, is_super_admin')
      .eq('user_id', user.id)
      .eq('clinic_id', patient.clinic_id)
      .eq('is_active', true)
      .single();

    // Allow if user is super_admin on any membership (cross-clinic access)
    let isSuperAdmin = false;
    if (membershipError || !membership) {
      // No membership for this clinic — check if super_admin elsewhere
      const { data: anyMembership } = await supabaseAdmin
        .from('clinic_memberships')
        .select('is_super_admin')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .eq('is_super_admin', true)
        .limit(1);
      isSuperAdmin = !!(anyMembership && anyMembership.length > 0);
    } else {
      isSuperAdmin = membership.is_super_admin === true;
    }

    const isAdmin = membership?.role === 'admin';

    if (!isAdmin && !isSuperAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    // Soft delete the patient
    const { data, error } = await supabaseAdmin
      .from('patients')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
        delete_reason: reason || 'Removed by admin',
      })
      .eq('id', patientId)
      .select()
      .single();

    if (error) {
      console.error('Error soft deleting patient:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Also discharge all active episodes for this patient
    const { error: episodeError } = await supabaseAdmin
      .from('episodes')
      .update({
        status: 'discharged',
        discharged_at: new Date().toISOString(),
        discharged_by: user.id,
        discharge_reason: 'Patient deleted',
      })
      .eq('patient_id', patientId)
      .eq('status', 'active');

    if (episodeError) {
      console.error('Error discharging episodes for deleted patient:', episodeError);
    }

    return NextResponse.json({
      success: true,
      message: 'Patient deleted successfully',
      data,
    });
  } catch (error) {
    console.error('Error in POST /api/patients/[id]/delete:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
