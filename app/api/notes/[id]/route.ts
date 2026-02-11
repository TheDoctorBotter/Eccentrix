import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // First try legacy notes table
    let { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('id', params.id)
      .single();

    // If not found in notes, try documents table
    if (error && error.code === 'PGRST116') {
      const docResult = await supabase
        .from('documents')
        .select('*')
        .eq('id', params.id)
        .single();

      if (docResult.error) {
        console.error('Error fetching document:', docResult.error);
        return NextResponse.json({ error: 'Note not found' }, { status: 404 });
      }

      // Map document to note format for compatibility
      data = {
        id: docResult.data.id,
        note_type: docResult.data.doc_type,
        output_text: docResult.data.output_text || '',
        rich_content: docResult.data.rich_content,
        billing_justification: docResult.data.billing_justification,
        hep_summary: docResult.data.hep_summary,
        template_id: docResult.data.template_id,
        created_at: docResult.data.created_at,
      };
    } else if (error) {
      console.error('Error fetching note:', error);
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching note:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Try deleting from legacy notes table
    const { error: notesError } = await supabase
      .from('notes')
      .delete()
      .eq('id', params.id);

    // Also try deleting any linked document record
    const { error: docsError } = await supabase
      .from('documents')
      .delete()
      .eq('legacy_note_id', params.id);

    // If note wasn't in notes table, try documents table directly
    if (notesError) {
      const { error: docDirectError } = await supabase
        .from('documents')
        .delete()
        .eq('id', params.id);

      if (docDirectError) {
        console.error('Error deleting note:', notesError, docDirectError);
        return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting note:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH - Update note content (rich text and plain text)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { rich_content, output_text } = body;

    // Validate that we have at least one field to update
    if (!rich_content && !output_text) {
      return NextResponse.json(
        { error: 'No content provided for update' },
        { status: 400 }
      );
    }

    // Build update object
    const updateData: Record<string, unknown> = {};

    if (rich_content) {
      // Store rich content as JSON string
      updateData.rich_content =
        typeof rich_content === 'string'
          ? rich_content
          : JSON.stringify(rich_content);
    }

    if (output_text) {
      updateData.output_text = output_text;
    }

    // Try updating legacy notes table first
    let { data, error } = await supabase
      .from('notes')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single();

    // If not in notes table, try documents
    if (error && error.code === 'PGRST116') {
      const docUpdateData: Record<string, unknown> = {};
      if (rich_content) docUpdateData.rich_content = updateData.rich_content;
      if (output_text) docUpdateData.output_text = output_text;

      const docResult = await supabase
        .from('documents')
        .update(docUpdateData)
        .eq('id', params.id)
        .select()
        .single();

      if (docResult.error) {
        console.error('Error updating document:', docResult.error);
        return NextResponse.json({ error: docResult.error.message }, { status: 500 });
      }

      data = docResult.data;
    } else if (error) {
      console.error('Error updating note:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating note:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
