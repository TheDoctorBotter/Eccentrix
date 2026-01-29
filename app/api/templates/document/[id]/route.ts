/**
 * Single Document Template API
 *
 * GET: Get template details or download template file
 * PATCH: Update template metadata
 * DELETE: Delete template
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const STORAGE_BUCKET = 'document-templates';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const download = searchParams.get('download') === 'true';

    // Get template metadata
    const { data: template, error } = await supabase
      .from('document_templates')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // If download requested, return the file
    if (download) {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .download(template.file_key);

      if (downloadError || !fileData) {
        console.error('Error downloading template file:', downloadError);
        return NextResponse.json(
          { error: 'Failed to download template file' },
          { status: 500 }
        );
      }

      // Return file as response
      const buffer = await fileData.arrayBuffer();
      return new NextResponse(buffer, {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${template.file_name}"`,
        },
      });
    }

    // Return metadata only
    return NextResponse.json(template);
  } catch (error) {
    console.error('Error in GET /api/templates/document/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { template_name, description, is_default } = body;

    // Get current template
    const { data: currentTemplate, error: fetchError } = await supabase
      .from('document_templates')
      .select('*')
      .eq('id', params.id)
      .single();

    if (fetchError || !currentTemplate) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // If setting as default, unset other defaults for same clinic + note_type
    if (is_default === true) {
      await supabase
        .from('document_templates')
        .update({ is_default: false })
        .eq('clinic_name', currentTemplate.clinic_name)
        .eq('note_type', currentTemplate.note_type)
        .neq('id', params.id);
    }

    // Build update object
    const updateData: Record<string, unknown> = {};
    if (template_name !== undefined) updateData.template_name = template_name;
    if (description !== undefined) updateData.description = description;
    if (is_default !== undefined) updateData.is_default = is_default;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('document_templates')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating template:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in PATCH /api/templates/document/[id]:', error);
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
    // Get template to find file_key
    const { data: template, error: fetchError } = await supabase
      .from('document_templates')
      .select('file_key')
      .eq('id', params.id)
      .single();

    if (fetchError || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([template.file_key]);

    if (storageError) {
      console.error('Error deleting template file:', storageError);
      // Continue with DB deletion even if storage fails
    }

    // Delete from database
    const { error: dbError } = await supabase
      .from('document_templates')
      .delete()
      .eq('id', params.id);

    if (dbError) {
      console.error('Error deleting template record:', dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/templates/document/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
