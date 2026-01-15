import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('branding_settings')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching branding settings:', error);
      return NextResponse.json(
        { error: 'Failed to fetch branding settings' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({
        clinic_name: '',
        address: '',
        phone: '',
        email: '',
        website: '',
        logo_url: null,
        letterhead_url: null,
        show_in_notes: true,
        provider_name: '',
        provider_credentials: '',
        provider_license: '',
        signature_enabled: true,
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
      clinic_name,
      address,
      phone,
      email,
      website,
      logo_url,
      letterhead_url,
      show_in_notes,
      provider_name,
      provider_credentials,
      provider_license,
      signature_enabled,
    } = body;

    const { data: existing } = await supabase
      .from('branding_settings')
      .select('id')
      .limit(1)
      .maybeSingle();

    let result;

    if (existing) {
      result = await supabase
        .from('branding_settings')
        .update({
          clinic_name: clinic_name || '',
          address: address || '',
          phone: phone || '',
          email: email || '',
          website: website || '',
          logo_url: logo_url || null,
          letterhead_url: letterhead_url || null,
          show_in_notes: show_in_notes !== undefined ? show_in_notes : true,
          provider_name: provider_name || '',
          provider_credentials: provider_credentials || '',
          provider_license: provider_license || '',
          signature_enabled: signature_enabled !== undefined ? signature_enabled : true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      result = await supabase
        .from('branding_settings')
        .insert({
          clinic_name: clinic_name || '',
          address: address || '',
          phone: phone || '',
          email: email || '',
          website: website || '',
          logo_url: logo_url || null,
          letterhead_url: letterhead_url || null,
          show_in_notes: show_in_notes !== undefined ? show_in_notes : true,
          provider_name: provider_name || '',
          provider_credentials: provider_credentials || '',
          provider_license: provider_license || '',
          signature_enabled: signature_enabled !== undefined ? signature_enabled : true,
        })
        .select()
        .single();
    }

    if (result.error) {
      console.error('Error saving branding settings:', result.error);
      return NextResponse.json(
        { error: 'Failed to save branding settings' },
        { status: 500 }
      );
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error('Error in branding POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
