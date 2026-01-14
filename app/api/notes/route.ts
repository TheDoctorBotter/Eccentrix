import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') || '50';

    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

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

    const { data, error } = await supabase
      .from('notes')
      .insert({
        note_type: body.note_type,
        input_data: body.input_data,
        output_text: body.output_text,
        billing_justification: body.billing_justification,
        hep_summary: body.hep_summary,
        template_id: body.template_id,
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
