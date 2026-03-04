import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // First try legacy notes table
    const { data: noteData, error } = await supabaseAdmin
      .from('notes')
      .select('*')
      .eq('id', params.id)
      .single();

    // If not found in notes, try documents table
    if (error && error.code === 'PGRST116') {
      const docResult = await supabaseAdmin
        .from('documents')
        .select('*')
        .eq('id', params.id)
        .single();

      if (docResult.error) {
        console.error('Error fetching document:', docResult.error);
        return NextResponse.json({ error: 'Note not found' }, { status: 404 });
      }

      // Map document to note format for compatibility
      const doc = docResult.data;
      const noteTypeMap: Record<string, string> = {
        daily_note: 'daily_soap',
        evaluation: 'pt_evaluation',
        re_evaluation: 'pt_evaluation',
      };
      return NextResponse.json({
        id: doc.id,
        note_type: noteTypeMap[doc.doc_type] || 'daily_soap',
        title: doc.title || null,
        date_of_service: doc.date_of_service || null,
        input_data: doc.input_data || {},
        output_text: doc.output_text || '',
        rich_content: doc.rich_content,
        billing_justification: doc.billing_justification,
        hep_summary: doc.hep_summary,
        template_id: doc.template_id,
        clinic_id: doc.clinic_id,
        patient_id: doc.patient_id,
        status: doc.status || 'draft',
        doc_type: doc.doc_type,
        finalized_at: doc.finalized_at,
        finalized_by: doc.finalized_by,
        created_at: doc.created_at,
      });
    } else if (error) {
      console.error('Error fetching note:', error);
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(noteData);
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
    const { error: notesError } = await supabaseAdmin
      .from('notes')
      .delete()
      .eq('id', params.id);

    // Also try deleting any linked document record
    await supabaseAdmin
      .from('documents')
      .delete()
      .eq('legacy_note_id', params.id);

    // If note wasn't in notes table, try documents table directly
    if (notesError) {
      const { error: docDirectError } = await supabaseAdmin
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
 * PATCH - Update note content (rich text and plain text) and/or finalize
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { rich_content, output_text, status, finalized_by } = body;

    // Validate that we have at least one field to update
    if (!rich_content && !output_text && !status) {
      return NextResponse.json(
        { error: 'No content provided for update' },
        { status: 400 }
      );
    }

    // Build update object
    const updateData: Record<string, unknown> = {};

    if (rich_content) {
      updateData.rich_content =
        typeof rich_content === 'string'
          ? rich_content
          : JSON.stringify(rich_content);
    }

    if (output_text) {
      updateData.output_text = output_text;
    }

    // Handle finalization
    if (status === 'final') {
      updateData.status = 'final';
      updateData.finalized_at = new Date().toISOString();
      if (finalized_by) {
        updateData.finalized_by = finalized_by;
      }
    } else if (status) {
      updateData.status = status;
    }

    // Try updating legacy notes table first
    const { data: noteData, error } = await supabaseAdmin
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
      if (updateData.status) docUpdateData.status = updateData.status;
      if (updateData.finalized_at) docUpdateData.finalized_at = updateData.finalized_at;
      if (updateData.finalized_by) docUpdateData.finalized_by = updateData.finalized_by;

      const docResult = await supabaseAdmin
        .from('documents')
        .update(docUpdateData)
        .eq('id', params.id)
        .select()
        .single();

      if (docResult.error) {
        console.error('Error updating document:', docResult.error);
        return NextResponse.json({ error: docResult.error.message }, { status: 500 });
      }

      return NextResponse.json(docResult.data);
    } else if (error) {
      console.error('Error updating note:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(noteData);
  } catch (error) {
    console.error('Error updating note:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
