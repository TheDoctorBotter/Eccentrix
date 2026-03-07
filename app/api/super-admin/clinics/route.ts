import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { supabase } from '@/lib/supabase';

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Helper: verify the caller is a super admin via the service role client
async function verifySuperAdmin(request: NextRequest): Promise<string | null> {
  const client = serviceRoleKey ? supabaseAdmin : supabase;

  // Extract the user's JWT from the Authorization header or cookie
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) return null;

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;

  // Check if user has is_super_admin flag
  const { data: membership } = await client
    .from('clinic_memberships')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_super_admin', true)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  return membership ? user.id : null;
}

/**
 * GET /api/super-admin/clinics
 * Returns all clinics with stats (patient count, staff count).
 * Only accessible to super admins.
 */
export async function GET(request: NextRequest) {
  try {
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    // Fetch all clinics
    const { data: clinics, error } = await client
      .from('clinics')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching clinics:', error);
      return NextResponse.json({ error: 'Failed to fetch clinics' }, { status: 500 });
    }

    // For each clinic, get patient and staff counts
    const clinicsWithStats = await Promise.all(
      (clinics || []).map(async (clinic) => {
        // Count active patients
        const { count: patientCount } = await client
          .from('patients')
          .select('id', { count: 'exact', head: true })
          .eq('clinic_id', clinic.id)
          .eq('is_active', true);

        // Count active staff
        const { count: staffCount } = await client
          .from('clinic_memberships')
          .select('id', { count: 'exact', head: true })
          .or(`clinic_id.eq.${clinic.id},clinic_id_ref.eq.${clinic.id}`)
          .eq('is_active', true);

        return {
          ...clinic,
          patient_count: patientCount || 0,
          staff_count: staffCount || 0,
        };
      })
    );

    return NextResponse.json(clinicsWithStats);
  } catch (error) {
    console.error('Error in super-admin clinics GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/super-admin/clinics
 * Create a new clinic and optionally invite a clinic admin.
 */
export async function POST(request: NextRequest) {
  try {
    const client = serviceRoleKey ? supabaseAdmin : supabase;
    const body = await request.json();

    const {
      name,
      slug,
      address,
      phone,
      fax,
      email,
      npi,
      tax_id,
      documentation_mode,
      // Optional: invite a clinic admin
      admin_email,
      admin_name,
    } = body;

    if (!name || !slug) {
      return NextResponse.json(
        { error: 'Clinic name and slug are required' },
        { status: 400 }
      );
    }

    // Check slug uniqueness
    const { data: existingSlug } = await client
      .from('clinics')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (existingSlug) {
      return NextResponse.json(
        { error: 'A clinic with this slug already exists' },
        { status: 409 }
      );
    }

    // Create the clinic
    const { data: clinic, error: clinicError } = await client
      .from('clinics')
      .insert({
        name,
        slug,
        address: address || null,
        phone: phone || null,
        fax: fax || null,
        email: email || null,
        npi: npi || null,
        tax_id: tax_id || null,
        documentation_mode: documentation_mode || 'emr',
        is_active: true,
      })
      .select()
      .single();

    if (clinicError) {
      console.error('Error creating clinic:', clinicError);
      return NextResponse.json(
        { error: 'Failed to create clinic', details: clinicError.message },
        { status: 500 }
      );
    }

    // If admin_email provided, invite the clinic admin
    let inviteResult = null;
    if (admin_email && serviceRoleKey) {
      try {
        // Invite user via Supabase Auth
        const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin
          .inviteUserByEmail(admin_email, {
            data: {
              full_name: admin_name || '',
              clinic_id: clinic.id,
              role: 'clinic_admin',
            },
          });

        if (inviteError) {
          console.error('Error inviting clinic admin:', inviteError);
          inviteResult = { error: inviteError.message };
        } else if (inviteData?.user) {
          // Create clinic membership for the invited user
          const { error: membershipError } = await supabaseAdmin
            .from('clinic_memberships')
            .insert({
              user_id: inviteData.user.id,
              clinic_id: clinic.id,
              clinic_id_ref: clinic.id,
              clinic_name: name,
              role: 'clinic_admin',
              is_active: true,
              is_super_admin: false,
            });

          if (membershipError) {
            console.error('Error creating membership:', membershipError);
            inviteResult = { error: `User invited but membership creation failed: ${membershipError.message}` };
          } else {
            inviteResult = { success: true, user_id: inviteData.user.id };
          }
        }
      } catch (inviteErr) {
        console.error('Invite error:', inviteErr);
        inviteResult = { error: 'Failed to send invite' };
      }
    }

    return NextResponse.json({
      clinic,
      invite: inviteResult,
    });
  } catch (error) {
    console.error('Error in super-admin clinics POST:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
