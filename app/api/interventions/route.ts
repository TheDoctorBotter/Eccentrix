import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('intervention_library')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching interventions:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching interventions:', error);
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
      .from('intervention_library')
      .insert({
        name: body.name,
        category: body.category,
        default_dosage: body.default_dosage,
        default_cues: body.default_cues,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating intervention:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error creating intervention:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
