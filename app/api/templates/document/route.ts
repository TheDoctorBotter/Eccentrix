/**
 * Document Templates API
 *
 * GET: List all document templates
 * POST: Upload a new document template
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-server';
import { detectPlaceholdersFromXml } from '@/lib/templates/docx-engine';
import { DocumentNoteType } from '@/lib/templates/types';

const STORAGE_BUCKET = 'document-templates';

export async function GET(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;
    const { searchParams } = new URL(request.url);
    const clinicName = searchParams.get('clinic_name');
    const noteType = searchParams.get('note_type') as DocumentNoteType | null;

    let query = client
      .from('document_templates')
      .select('*')
      .order('clinic_name', { ascending: true })
      .order('note_type', { ascending: true })
      .order('created_at', { ascending: false });

    if (clinicName) {
      query = query.eq('clinic_name', clinicName);
    }

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
    console.error('Error in GET /api/templates/document:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const client = serviceRoleKey ? supabaseAdmin : supabase;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const clinicName = formData.get('clinic_name') as string | null;
    const noteType = formData.get('note_type') as DocumentNoteType | null;
    const templateName = formData.get('template_name') as string | null;
    const description = formData.get('description') as string | null;
    const isDefault = formData.get('is_default') === 'true';

    // Validate required fields
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!clinicName) {
      return NextResponse.json(
        { error: 'clinic_name is required' },
        { status: 400 }
      );
    }

    if (!noteType) {
      return NextResponse.json(
        { error: 'note_type is required' },
        { status: 400 }
      );
    }

    if (!templateName) {
      return NextResponse.json(
        { error: 'template_name is required' },
        { status: 400 }
      );
    }

    // Validate file type
    if (
      !file.name.endsWith('.docx') &&
      file.type !==
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      return NextResponse.json(
        { error: 'Only .docx files are supported' },
        { status: 400 }
      );
    }

    // Read file buffer
    const fileBuffer = await file.arrayBuffer();

    // Detect placeholders in the template
    const placeholders = detectPlaceholdersFromXml(fileBuffer);

    // Generate unique file key
    const timestamp = Date.now();
    const sanitizedClinic = clinicName.replace(/[^a-zA-Z0-9]/g, '_');
    const sanitizedName = templateName.replace(/[^a-zA-Z0-9]/g, '_');
    const fileKey = `${sanitizedClinic}/${noteType}/${sanitizedName}_${timestamp}.docx`;

    // Upload to Supabase Storage
    const { error: uploadError } = await client.storage
      .from(STORAGE_BUCKET)
      .upload(fileKey, fileBuffer, {
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: false,
      });

    if (uploadError) {
      console.error('Error uploading file:', uploadError);
      if (uploadError.message.includes('Bucket not found')) {
        return NextResponse.json(
          {
            error: 'Storage bucket not found',
            details: serviceRoleKey
              ? `The "${STORAGE_BUCKET}" bucket does not exist. Please create it in Supabase Dashboard > Storage.`
              : `The "${STORAGE_BUCKET}" bucket is not accessible. Verify the bucket exists in the same Supabase project as your NEXT_PUBLIC_SUPABASE_URL, and either set SUPABASE_SERVICE_ROLE_KEY or allow uploads via storage policies.`,
          },
          { status: 500 }
        );
      }

      if (uploadError.message.includes('signature') || uploadError.message.includes('JWT')) {
        return NextResponse.json(
          {
            error: 'Authentication failed - Signature verification failed',
            details:
              'The SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY do not match or belong to different projects. Please verify both values are from the same Supabase project.',
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { error: `Failed to upload file: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // If this should be the default, unset any existing defaults
    if (isDefault) {
      await client
        .from('document_templates')
        .update({ is_default: false })
        .eq('clinic_name', clinicName)
        .eq('note_type', noteType);
    }

    // Create database record
    const { data, error: dbError } = await client
      .from('document_templates')
      .insert({
        clinic_name: clinicName,
        note_type: noteType,
        template_name: templateName,
        description: description || null,
        file_key: fileKey,
        file_name: file.name,
        file_size: file.size,
        is_default: isDefault,
        placeholders_detected: placeholders,
      })
      .select()
      .single();

    if (dbError) {
      // Clean up uploaded file if DB insert fails
      await client.storage.from(STORAGE_BUCKET).remove([fileKey]);

      console.error('Error creating template record:', dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/templates/document:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
