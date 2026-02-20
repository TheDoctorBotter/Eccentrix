import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { formatNoteTitle } from '@/lib/note-utils';
import { NoteType } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') || '50';
    const clinicId = searchParams.get('clinic_id');

    let query = supabase
      .from('notes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    // Scope to clinic when provided
    if (clinicId) {
      query = query.eq('clinic_id', clinicId);
    }

    // Filter to only PTBot-imported notes
    const ptbot = searchParams.get('ptbot');
    if (ptbot === 'true') {
      query = query.not('input_data->>ptbot_external_id', 'is', null);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching notes:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching notes:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const patientName = body.input_data?.patientDemographic?.patientName;
    const dateOfService = body.input_data?.dateOfService;

    const title = formatNoteTitle(
      patientName,
      body.note_type as NoteType,
      dateOfService,
      new Date().toISOString()
    );

    const { data, error } = await supabase
      .from('notes')
      .insert({
        note_type: body.note_type,
        title: title,
        date_of_service: dateOfService || null,
        input_data: body.input_data,
        output_text: body.output_text,
        billing_justification: body.billing_justification,
        hep_summary: body.hep_summary,
        template_id: body.template_id,
        clinic_id: body.clinic_id || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating note:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error creating note:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
