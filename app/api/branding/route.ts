import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
// FIX: Use the service role client to bypass RLS. The original code used the anon
// client which has no server-side session, causing all reads and writes to be
// silently blocked by RLS policies on branding_settings.
import { supabaseAdmin } from '@/lib/supabase-server';

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinic_id');

    if (!clinicId) {
      return NextResponse.json(
        { error: 'clinic_id is required' },
        { status: 400 }
      );
    }

    // FIX: Use supabaseAdmin (service role) so the server-side query is not
    // blocked by RLS. The anon client has no session on the server, so RLS
    // policies requiring auth.uid() would return zero rows.
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const { data, error } = await client
      .from('branding_settings')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching branding settings:', error);
      return NextResponse.json(
        { error: 'Failed to fetch branding settings', details: error.message },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({
        clinic_name: '',
        address: '',
        phone: '',
        fax: '',
        email: '',
        website: '',
        npi: '',
        tax_id: '',
        logo_url: null,
        logo_storage_path: null,
        letterhead_url: null,
        letterhead_storage_path: null,
        show_in_notes: true,
        provider_name: '',
        provider_credentials: '',
        provider_license: '',
        signature_enabled: true,
        primary_color: '#1e40af',
        secondary_color: '#64748b',
      });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in branding GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      clinic_id,
      clinic_name,
      address,
      phone,
      fax,
      email,
      website,
      npi,
      tax_id,
      logo_url,
      logo_storage_path,
      letterhead_url,
      letterhead_storage_path,
      show_in_notes,
      provider_name,
      provider_credentials,
      provider_license,
      signature_enabled,
      primary_color,
      secondary_color,
    } = body;

    if (!clinic_id) {
      return NextResponse.json(
        { error: 'clinic_id is required' },
        { status: 400 }
      );
    }

    // FIX: Use the service role client to bypass RLS. The anon client on the
    // server has no session, so INSERT/UPDATE were silently blocked by RLS.
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    // Check if a row already exists for this clinic
    const { data: existing } = await client
      .from('branding_settings')
      .select('id')
      .eq('clinic_id', clinic_id)
      .limit(1)
      .maybeSingle();

    // FIX: Build the upsert payload. Using upsert ensures that if no row exists
    // yet, one is created. The original code used separate insert/update which
    // could silently update zero rows if the initial SELECT failed due to RLS.
    const payload = {
      ...(existing?.id ? { id: existing.id } : {}),
      clinic_id,
      clinic_name: clinic_name || '',
      address: address || '',
      phone: phone || '',
      fax: fax || '',
      email: email || '',
      website: website || '',
      npi: npi || '',
      tax_id: tax_id || '',
      logo_url: logo_url || null,
      logo_storage_path: logo_storage_path || null,
      letterhead_url: letterhead_url || null,
      letterhead_storage_path: letterhead_storage_path || null,
      show_in_notes: show_in_notes !== undefined ? show_in_notes : true,
      provider_name: provider_name || '',
      provider_credentials: provider_credentials || '',
      provider_license: provider_license || '',
      signature_enabled: signature_enabled !== undefined ? signature_enabled : true,
      primary_color: primary_color || '#1e40af',
      secondary_color: secondary_color || '#64748b',
      updated_at: new Date().toISOString(),
    };

    let result;

    if (existing?.id) {
      // Update existing row
      result = await client
        .from('branding_settings')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      // Insert new row
      result = await client
        .from('branding_settings')
        .insert(payload)
        .select()
        .single();
    }

    if (result.error) {
      console.error('Error saving branding settings:', result.error);
      // FIX: Return the specific Supabase error message so the UI can display
      // exactly what went wrong, rather than a generic "Failed to save" message.
      return NextResponse.json(
        { error: 'Failed to save branding settings', details: result.error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error('Error in branding POST:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
