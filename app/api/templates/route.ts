import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const noteType = searchParams.get('noteType');

    let query = supabase.from('templates').select('*').order('created_at', { ascending: false });

    if (noteType) {
      query = query.eq('note_type', noteType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching templates:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.is_default) {
      await supabase
        .from('templates')
        .update({ is_default: false })
        .eq('note_type', body.note_type);
    }

    const { data, error } = await supabase
      .from('templates')
      .insert({
        name: body.name,
        note_type: body.note_type,
        content: body.content,
        style_settings: body.style_settings || {},
        required_sections: body.required_sections || {},
        is_default: body.is_default || false,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating template:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error creating template:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
