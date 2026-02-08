/**
 * Note Finalization API
 *
 * POST: Finalize a note (change status from draft to final)
 * DELETE: Revert a note to draft status
 *
 * Enforces PT-only finalization rules for certain document types.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';
import {
  ClinicalDocType,
  PT_ONLY_FINALIZATION_TYPES,
  ClinicRole,
} from '@/lib/types';

interface FinalizeRequestBody {
  user_id: string;
  user_role?: ClinicRole;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const noteId = params.id;
    const body: FinalizeRequestBody = await request.json();
    const { user_id, user_role } = body;

    if (!user_id) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      );
    }

    // Fetch the note to check its current status and doc_type
    const { data: note, error: fetchError } = await client
      .from('notes')
      .select('id, status, doc_type, clinic_name')
      .eq('id', noteId)
      .single();

    if (fetchError || !note) {
      return NextResponse.json(
        { error: 'Note not found' },
        { status: 404 }
      );
    }

    if (note.status === 'final') {
      return NextResponse.json(
        { error: 'Note is already finalized' },
        { status: 400 }
      );
    }

    // Check if this doc type requires PT finalization
    const docType = note.doc_type as ClinicalDocType | null;
    if (docType && PT_ONLY_FINALIZATION_TYPES.includes(docType)) {
      // Need to verify user is a PT
      // First check if role was provided
      if (user_role && user_role !== 'pt') {
        return NextResponse.json(
          {
            error: 'Only licensed Physical Therapists (PT) can finalize this document type',
            doc_type: docType,
          },
          { status: 403 }
        );
      }

      // Also check database for user's role
      const { data: membership } = await client
        .from('clinic_memberships')
        .select('role')
        .eq('user_id', user_id)
        .eq('is_active', true)
        .single();

      if (!membership || membership.role !== 'pt') {
        return NextResponse.json(
          {
            error: 'Only licensed Physical Therapists (PT) can finalize this document type',
            doc_type: docType,
            user_role: membership?.role || 'unknown',
          },
          { status: 403 }
        );
      }
    }

    // Finalize the note
    const { data: updatedNote, error: updateError } = await client
      .from('notes')
      .update({
        status: 'final',
        finalized_at: new Date().toISOString(),
        finalized_by: user_id,
      })
      .eq('id', noteId)
      .select()
      .single();

    if (updateError) {
      console.error('Error finalizing note:', updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      note: updatedNote,
      message: 'Note has been finalized',
    });
  } catch (error) {
    console.error('Error in POST /api/notes/[id]/finalize:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Revert a note to draft status
 * Only the user who finalized it (or an admin/PT) can revert
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const noteId = params.id;

    // Get user_id from query params or body
    const { searchParams } = new URL(request.url);
    const user_id = searchParams.get('user_id');

    if (!user_id) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      );
    }

    // Fetch the note
    const { data: note, error: fetchError } = await client
      .from('notes')
      .select('id, status, finalized_by')
      .eq('id', noteId)
      .single();

    if (fetchError || !note) {
      return NextResponse.json(
        { error: 'Note not found' },
        { status: 404 }
      );
    }

    if (note.status !== 'final') {
      return NextResponse.json(
        { error: 'Note is not finalized' },
        { status: 400 }
      );
    }

    // Check if user can revert (must be the one who finalized or a PT)
    const { data: membership } = await client
      .from('clinic_memberships')
      .select('role')
      .eq('user_id', user_id)
      .eq('is_active', true)
      .single();

    const isPT = membership?.role === 'pt';
    const isOriginalFinalizer = note.finalized_by === user_id;

    if (!isPT && !isOriginalFinalizer) {
      return NextResponse.json(
        { error: 'Only the original finalizer or a PT can revert this note to draft' },
        { status: 403 }
      );
    }

    // Revert to draft
    const { data: updatedNote, error: updateError } = await client
      .from('notes')
      .update({
        status: 'draft',
        finalized_at: null,
        finalized_by: null,
      })
      .eq('id', noteId)
      .select()
      .single();

    if (updateError) {
      console.error('Error reverting note:', updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      note: updatedNote,
      message: 'Note has been reverted to draft',
    });
  } catch (error) {
    console.error('Error in DELETE /api/notes/[id]/finalize:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
