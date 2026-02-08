/**
 * Documents API
 * GET: List documents for an episode
 * POST: Create a new document
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const { searchParams } = new URL(request.url);
    const episodeId = searchParams.get('episode_id');
    const clinicId = searchParams.get('clinic_id');
    const patientId = searchParams.get('patient_id');
    const status = searchParams.get('status');
    const docType = searchParams.get('doc_type');

    let query = client.from('documents').select('*');

    if (episodeId) {
      query = query.eq('episode_id', episodeId);
    }

    if (clinicId) {
      query = query.eq('clinic_id', clinicId);
    }

    if (patientId) {
      query = query.eq('patient_id', patientId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (docType) {
      query = query.eq('doc_type', docType);
    }

    const { data, error } = await query.order('date_of_service', { ascending: false });

    if (error) {
      console.error('Error fetching documents:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Error in GET /api/documents:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const body = await request.json();
    const {
      episode_id,
      clinic_id,
      patient_id,
      doc_type,
      title,
      date_of_service,
      input_data,
      output_text,
      rich_content,
      billing_justification,
      hep_summary,
      template_id,
      document_template_id,
      legacy_note_id,
    } = body;

    if (!episode_id || !clinic_id || !patient_id || !doc_type) {
      return NextResponse.json(
        { error: 'episode_id, clinic_id, patient_id, and doc_type are required' },
        { status: 400 }
      );
    }

    const { data, error } = await client
      .from('documents')
      .insert({
        episode_id,
        clinic_id,
        patient_id,
        doc_type,
        title,
        date_of_service: date_of_service || new Date().toISOString().split('T')[0],
        input_data: input_data || {},
        output_text,
        rich_content,
        billing_justification,
        hep_summary,
        template_id,
        document_template_id,
        legacy_note_id,
        status: 'draft',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating document:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/documents:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
